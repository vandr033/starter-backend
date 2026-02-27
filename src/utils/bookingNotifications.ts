import nodemailer from "nodemailer";
import { createWasender, RetryConfig, TextOnlyMessage } from "wasenderapi";
import { prisma } from "../prisma/client";
import { logger } from "../config/logger";
import { CompanyUserRole } from "@prisma/client";

const emailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

const wasenderApiKey = process.env.WASENDER_API_KEY!;
const wasenderToken = process.env.WASENDER_PERSONAL_ACCESS_TOKEN!;
const retryOptions: RetryConfig = { enabled: true, maxRetries: 3 };
const wasender = createWasender(wasenderApiKey, wasenderToken, undefined, undefined, retryOptions);

interface BookingNotificationData {
    companyId: number;
    bookingId: number;
    staffId?: number;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerPhonePrefix?: string | null;
    customerName?: string | null;
    companyName: string;
    staffName: string;
    serviceNames: string[];
    startAt: Date;
    endAt: Date;
    totalPriceCents: number;
}

type InternalRecipientRole = "staff" | "owner";

interface InternalRecipient {
    userId: string;
    role: InternalRecipientRole;
    name: string;
    email: string | null;
    phone: string | null;
}

/**
 * Fetch company notification settings. Returns flags indicating whether
 * email and/or WhatsApp notifications should be sent.
 */
async function getNotificationSettings(companyId: number) {
    const settings = await prisma.companySettings.findUnique({
        where: { company_id: companyId },
        select: {
            send_email_notifications: true,
            send_whatsapp_notifications: true,
        },
    });
    return {
        sendEmail: settings?.send_email_notifications ?? true,
        sendWhatsapp: settings?.send_whatsapp_notifications ?? false,
    };
}

function formatDate(date: Date): string {
    return date.toLocaleDateString("es", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString("es", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatPrice(cents: number): string {
    return (cents / 100).toFixed(2);
}

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (!cleanPhone) return null;
    const cleanPrefix = (prefix || "591").replace(/\D/g, "");
    return `${cleanPrefix}${cleanPhone}`;
}

function normalizeEmail(email?: string | null): string | null {
    const cleanEmail = (email || "").trim().toLowerCase();
    return cleanEmail || null;
}

function getManageBookingUrl(bookingId: number): string {
    const base =
        process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        "http://localhost:3000";
    return `${base.replace(/\/$/, "")}/admin/dashboard/bookings?bookingId=${bookingId}`;
}

async function getInternalRecipients(companyId: number, staffId?: number) {
    const recipientsByUserId = new Map<string, InternalRecipient>();

    const upsertRecipient = (recipient: InternalRecipient) => {
        if (!recipient.email && !recipient.phone) return;

        const existing = recipientsByUserId.get(recipient.userId);
        if (!existing) {
            recipientsByUserId.set(recipient.userId, recipient);
            return;
        }

        existing.email = existing.email || recipient.email;
        existing.phone = existing.phone || recipient.phone;

        // Keep staff role if user is both assigned staff and owner.
        if (existing.role !== "staff" && recipient.role === "staff") {
            existing.role = "staff";
            existing.name = recipient.name;
        }
    };

    if (staffId) {
        const staffProfile = await prisma.staffProfile.findFirst({
            where: {
                id: staffId,
                company_id: companyId,
                deleted_at: null,
            },
            select: {
                display_name: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        first_name: true,
                        name: true,
                        phoneNumber: true,
                        phone_prefix: true,
                    },
                },
            },
        });

        if (staffProfile?.user?.id) {
            upsertRecipient({
                userId: staffProfile.user.id,
                role: "staff",
                name:
                    staffProfile.display_name ||
                    staffProfile.user.first_name ||
                    staffProfile.user.name ||
                    "Staff",
                email: normalizeEmail(staffProfile.user.email),
                phone: buildFullPhone(
                    staffProfile.user.phone_prefix,
                    staffProfile.user.phoneNumber,
                ),
            });
        }
    }

    const owners = await prisma.companyUser.findMany({
        where: {
            company_id: companyId,
            role: CompanyUserRole.OWNER,
            deleted_at: null,
        },
        select: {
            user: {
                select: {
                    id: true,
                    first_name: true,
                    name: true,
                    email: true,
                    phoneNumber: true,
                    phone_prefix: true,
                },
            },
        },
    });

    for (const owner of owners) {
        upsertRecipient({
            userId: owner.user.id,
            role: "owner",
            name: owner.user.first_name || owner.user.name || "Owner",
            email: normalizeEmail(owner.user.email),
            phone: buildFullPhone(owner.user.phone_prefix, owner.user.phoneNumber),
        });
    }

    return Array.from(recipientsByUserId.values());
}

function buildInternalWhatsappText(
    data: BookingNotificationData,
    recipientRole: InternalRecipientRole,
): string {
    const services = data.serviceNames.join(", ");
    const manageUrl = getManageBookingUrl(data.bookingId);
    const customerPhone =
        buildFullPhone(data.customerPhonePrefix, data.customerPhone) || "No disponible";

    const intro =
        recipientRole === "staff"
            ? "📣 Nueva reserva asignada"
            : "📣 Nueva reserva en tu tienda";

    return [
        intro,
        ``,
        `Cliente: ${data.customerName || "Sin nombre"}`,
        `Teléfono: ${customerPhone}`,
        `Email: ${data.customerEmail || "No disponible"}`,
        `Staff: ${data.staffName || "No asignado"}`,
        `Servicios: ${services}`,
        `Fecha: ${formatDate(data.startAt)}`,
        `Hora: ${formatTime(data.startAt)} – ${formatTime(data.endAt)}`,
        `Total: ${formatPrice(data.totalPriceCents)} Bs`,
        ``,
        `Gestionar reserva: ${manageUrl}`,
    ].join("\n");
}

function bookingInternalEmailHtml(
    data: BookingNotificationData,
    recipient: InternalRecipient,
): string {
    const serviceList = data.serviceNames.map((s) => `<li>${s}</li>`).join("");
    const manageUrl = getManageBookingUrl(data.bookingId);
    const customerPhone =
        buildFullPhone(data.customerPhonePrefix, data.customerPhone) || "No disponible";
    const heading =
        recipient.role === "staff" ? "Nueva reserva asignada" : "Nueva reserva en tu tienda";

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${heading}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
        .container { background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header h1 { color: #0f172a; font-size: 22px; margin-bottom: 16px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .details p { margin: 5px 0; }
        .button { display: inline-block; margin-top: 12px; padding: 10px 16px; border-radius: 6px; text-decoration: none; color: #fff; background: #2563eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>${heading}</h1></div>
        <p>Hola ${recipient.name || ""},</p>
        <p>Se registró una nueva reserva. Aquí están los datos:</p>
        <div class="details">
          <p><strong>Cliente:</strong> ${data.customerName || "Sin nombre"}</p>
          <p><strong>Teléfono cliente:</strong> ${customerPhone}</p>
          <p><strong>Email cliente:</strong> ${data.customerEmail || "No disponible"}</p>
          <p><strong>Negocio:</strong> ${data.companyName}</p>
          <p><strong>Staff:</strong> ${data.staffName || "No asignado"}</p>
          <p><strong>Fecha:</strong> ${formatDate(data.startAt)}</p>
          <p><strong>Hora:</strong> ${formatTime(data.startAt)} – ${formatTime(data.endAt)}</p>
          <p><strong>Servicios:</strong></p>
          <ul>${serviceList}</ul>
          <p><strong>Total:</strong> ${formatPrice(data.totalPriceCents)} Bs</p>
        </div>
        <a class="button" href="${manageUrl}">Gestionar reserva</a>
      </div>
    </body>
    </html>`;
}

// ─── EMAIL TEMPLATES ─────────────────────────────────────

function bookingEmailHtml(
    data: BookingNotificationData,
    title: string,
    mainMessage: string,
    accentColor: string
): string {
    const serviceList = data.serviceNames.map((s) => `<li>${s}</li>`).join("");
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
        .container { background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 20px; }
        .header h1 { color: ${accentColor}; font-size: 22px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .details p { margin: 5px 0; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>${title}</h1></div>
        <p>Hola ${data.customerName || ""},</p>
        <p>${mainMessage}</p>
        <div class="details">
          <p><strong>Negocio:</strong> ${data.companyName}</p>
          <p><strong>Profesional:</strong> ${data.staffName}</p>
          <p><strong>Fecha:</strong> ${formatDate(data.startAt)}</p>
          <p><strong>Hora:</strong> ${formatTime(data.startAt)} – ${formatTime(data.endAt)}</p>
          <p><strong>Servicios:</strong></p>
          <ul>${serviceList}</ul>
          <p><strong>Total:</strong> ${formatPrice(data.totalPriceCents)} Bs</p>
        </div>
        <div class="footer"><p>${data.companyName}</p></div>
      </div>
    </body>
    </html>`;
}

// ─── SEND HELPERS (fire-and-forget, never throw) ─────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
        await emailTransporter.sendMail({
            to,
            from: process.env.MAIL_FROM!,
            subject,
            html,
        });
    } catch (err) {
        logger.error({ err, to }, "Failed to send booking notification email");
    }
}

async function sendWhatsapp(phone: string, text: string): Promise<void> {
    try {
        const payload: TextOnlyMessage = { messageType: "text", to: phone, text };
        await wasender.send(payload);
    } catch (err) {
        logger.error({ err, phone }, "Failed to send booking WhatsApp notification");
    }
}

function buildWhatsappText(data: BookingNotificationData, intro: string): string {
    const services = data.serviceNames.join(", ");
    return [
        `${intro}`,
        ``,
        `📍 ${data.companyName}`,
        `👤 ${data.staffName}`,
        `📅 ${formatDate(data.startAt)}`,
        `🕐 ${formatTime(data.startAt)} – ${formatTime(data.endAt)}`,
        `✂️ ${services}`,
        `💰 ${formatPrice(data.totalPriceCents)} Bs`,
    ].join("\n");
}

// ─── PUBLIC API ──────────────────────────────────────────

/**
 * Send confirmation notification when a booking is created.
 * Checks company settings before sending. Fire-and-forget.
 */
export async function notifyBookingCreated(data: BookingNotificationData): Promise<void> {
    const { sendEmail: doEmail, sendWhatsapp: doWa } = await getNotificationSettings(data.companyId);

    if (doEmail && data.customerEmail) {
        const html = bookingEmailHtml(
            data,
            "Reserva Confirmada",
            "Tu reserva ha sido creada exitosamente. Aquí están los detalles:",
            "#007bff"
        );
        void sendEmail(data.customerEmail, `Reserva confirmada – ${data.companyName}`, html);
    }

    if (doWa && data.customerPhone) {
        const phone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
        if (phone) {
            const text = buildWhatsappText(
                data,
                `✅ Hola ${data.customerName || ""}, tu reserva en ${data.companyName} ha sido confirmada.`
            );
            void sendWhatsapp(phone, text);
        }
    }

    // Internal notifications (assigned staff + owners)
    if (doEmail || doWa) {
        try {
            const recipients = await getInternalRecipients(data.companyId, data.staffId);
            for (const recipient of recipients) {
                if (doEmail && recipient.email) {
                    const subject =
                        recipient.role === "staff"
                            ? `Nueva reserva asignada – ${data.companyName}`
                            : `Nueva reserva en tu tienda – ${data.companyName}`;
                    const html = bookingInternalEmailHtml(data, recipient);
                    void sendEmail(recipient.email, subject, html);
                }

                if (doWa && recipient.phone) {
                    const text = buildInternalWhatsappText(data, recipient.role);
                    void sendWhatsapp(recipient.phone, text);
                }
            }
        } catch (err) {
            logger.error(
                { err, bookingId: data.bookingId },
                "Failed to send internal booking notifications",
            );
        }
    }
}

/**
 * Send notification when a booking is updated (rescheduled, staff changed, etc.).
 */
export async function notifyBookingUpdated(data: BookingNotificationData): Promise<void> {
    const { sendEmail: doEmail, sendWhatsapp: doWa } = await getNotificationSettings(data.companyId);

    if (doEmail && data.customerEmail) {
        const html = bookingEmailHtml(
            data,
            "Reserva Actualizada",
            "Tu reserva ha sido modificada. Revisa los nuevos detalles:",
            "#f59e0b"
        );
        void sendEmail(data.customerEmail, `Reserva actualizada – ${data.companyName}`, html);
    }

    if (doWa && data.customerPhone) {
        const phone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
        if (phone) {
            const text = buildWhatsappText(
                data,
                `📝 Hola ${data.customerName || ""}, tu reserva en ${data.companyName} ha sido actualizada.`
            );
            void sendWhatsapp(phone, text);
        }
    }
}

/**
 * Send notification when a booking is cancelled.
 */
export async function notifyBookingCancelled(data: BookingNotificationData): Promise<void> {
    const { sendEmail: doEmail, sendWhatsapp: doWa } = await getNotificationSettings(data.companyId);

    if (doEmail && data.customerEmail) {
        const html = bookingEmailHtml(
            data,
            "Reserva Cancelada",
            "Tu reserva ha sido cancelada. Si esto fue un error, por favor contáctanos para reagendar.",
            "#dc3545"
        );
        void sendEmail(data.customerEmail, `Reserva cancelada – ${data.companyName}`, html);
    }

    if (doWa && data.customerPhone) {
        const phone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
        if (phone) {
            const text = buildWhatsappText(
                data,
                `❌ Hola ${data.customerName || ""}, tu reserva en ${data.companyName} ha sido cancelada.`
            );
            void sendWhatsapp(phone, text);
        }
    }
}
