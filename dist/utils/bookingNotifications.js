"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineServiceNotificationAudiences = combineServiceNotificationAudiences;
exports.notifyBookingCreated = notifyBookingCreated;
exports.notifyBookingPendingForManagement = notifyBookingPendingForManagement;
exports.notifyBookingConfirmedForStaff = notifyBookingConfirmedForStaff;
exports.notifyBookingUpdated = notifyBookingUpdated;
exports.notifyBookingCancelled = notifyBookingCancelled;
exports.notifyBookingTodayReminder = notifyBookingTodayReminder;
exports.notifyBookingNoShow = notifyBookingNoShow;
const client_1 = require("../prisma/client");
const logger_1 = require("../config/logger");
const client_2 = require("@prisma/client");
const notificationBranding_1 = require("./notificationBranding");
const company_entitlements_service_1 = require("../services/company-entitlements.service");
const sendEmail_1 = require("./sendEmail");
const whatsappSender_1 = require("./whatsappSender");
const coordinates_1 = require("./coordinates");
const DEFAULT_NOTIFICATION_AUDIENCE = {
    customer: true,
    assignedStaff: true,
    management: true,
};
function combineServiceNotificationAudiences(services) {
    if (services.length === 0)
        return { ...DEFAULT_NOTIFICATION_AUDIENCE };
    return {
        customer: services.some((service) => service.notify_customer),
        assignedStaff: services.some((service) => service.notify_assigned_staff),
        management: services.some((service) => service.notify_management),
    };
}
async function getNotificationAudiencePolicy(companyId, serviceIds) {
    const uniqueServiceIds = Array.from(new Set((serviceIds ?? []).filter((id) => Number.isInteger(id) && id > 0)));
    if (uniqueServiceIds.length === 0)
        return DEFAULT_NOTIFICATION_AUDIENCE;
    const hasMessagingPro = await (0, company_entitlements_service_1.companyHasCapability)(companyId, "MENSAJERIA_PRO");
    if (!hasMessagingPro)
        return DEFAULT_NOTIFICATION_AUDIENCE;
    const services = await client_1.prisma.service.findMany({
        where: {
            id: { in: uniqueServiceIds },
            company_id: companyId,
            deleted_at: null,
        },
        select: {
            notify_customer: true,
            notify_assigned_staff: true,
            notify_management: true,
        },
    });
    // A booking can contain more than one service. A recipient group is included
    // when at least one selected service enables it, so a notification is never
    // silently lost because another service in the same booking disables it.
    return combineServiceNotificationAudiences(services);
}
/**
 * Fetch company notification settings. Returns flags indicating whether
 * email and/or WhatsApp notifications should be sent.
 */
async function getNotificationSettings(companyId) {
    const settings = await client_1.prisma.companySettings.findUnique({
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
function resolveLocaleTag(locale) {
    return locale === "en" ? "en-US" : "es-BO";
}
function formatDate(date, locale = "es", timeZone) {
    return date.toLocaleDateString(resolveLocaleTag(locale), {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        ...(timeZone ? { timeZone } : {}),
    });
}
function formatTime(date, locale = "es", timeZone) {
    return date.toLocaleTimeString(resolveLocaleTag(locale), {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        ...(timeZone ? { timeZone } : {}),
    });
}
async function withCompanyTimeZone(data) {
    const [company, branding] = await Promise.all([
        client_1.prisma.company.findUnique({
            where: { id: data.companyId },
            select: {
                timezone: true,
                google_maps_url: true,
                latitude: true,
                longitude: true,
            },
        }),
        (0, notificationBranding_1.getCompanyNotificationBranding)(data.companyId),
    ]);
    return {
        ...data,
        timeZone: data.timeZone || company?.timezone || "UTC",
        companyGoogleMapsUrl: data.companyGoogleMapsUrl ?? company?.google_maps_url ?? null,
        companyLatitude: data.companyLatitude ?? company?.latitude ?? null,
        companyLongitude: data.companyLongitude ?? company?.longitude ?? null,
        branding: (0, notificationBranding_1.mergeBranding)(branding, {
            ...data.branding,
            companyName: data.companyName,
        }),
    };
}
function formatPrice(cents) {
    return (cents / 100).toFixed(2);
}
function buildFullPhone(prefix, phone) {
    const cleanPhone = (phone || "").replace(/\D/g, "");
    if (!cleanPhone)
        return null;
    const cleanPrefix = (prefix || "591").replace(/\D/g, "");
    return `${cleanPrefix}${cleanPhone}`;
}
function normalizeEmail(email) {
    const cleanEmail = (email || "").trim().toLowerCase();
    return cleanEmail || null;
}
function getCompanyDirectionsUrl(data) {
    const coordinates = (0, coordinates_1.getValidCoordinates)(data.companyLatitude, data.companyLongitude);
    if (coordinates) {
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`)}`;
    }
    return (0, coordinates_1.getSafeMapUrl)(data.companyGoogleMapsUrl);
}
function buildMapsLine(data, label = "Mapa") {
    const directionsUrl = getCompanyDirectionsUrl(data);
    return directionsUrl ? `🗺️ ${label}: ${directionsUrl}` : null;
}
function buildLocationHtml(data, label, linkLabel) {
    const directionsUrl = getCompanyDirectionsUrl(data);
    if (!directionsUrl)
        return "";
    return `<p><strong>${label}:</strong> <a href="${escapeHtml(directionsUrl)}">${escapeHtml(linkLabel)}</a></p>`;
}
function getManageBookingUrl(bookingId) {
    const base = process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        "http://localhost:3000";
    return `${base.replace(/\/$/, "")}/admin/dashboard/bookings?bookingId=${bookingId}`;
}
function getCustomerManageBookingUrl(companySlug) {
    const base = process.env.FRONTEND_URL ||
        process.env.NEXT_PUBLIC_FRONTEND_URL ||
        "http://localhost:3000";
    const normalizedBase = base.replace(/\/$/, "");
    const normalizedSlug = (companySlug || "").trim().toLowerCase();
    if (normalizedSlug) {
        return `${normalizedBase}/me/appointments?shop=${encodeURIComponent(normalizedSlug)}`;
    }
    return `${normalizedBase}/me/appointments`;
}
async function getInternalRecipients(companyId, staffId) {
    const recipientsByUserId = new Map();
    const upsertRecipient = (recipient) => {
        if (!recipient.email && !recipient.phone)
            return;
        const existing = recipientsByUserId.get(recipient.userId);
        if (!existing) {
            recipientsByUserId.set(recipient.userId, recipient);
            return;
        }
        existing.email = existing.email || recipient.email;
        existing.phone = existing.phone || recipient.phone;
        existing.isAssignedStaff = existing.isAssignedStaff || recipient.isAssignedStaff;
        existing.isManagement = existing.isManagement || recipient.isManagement;
        // Keep staff role if user is both assigned staff and owner.
        if (existing.role !== "staff" && recipient.role === "staff") {
            existing.role = "staff";
            existing.name = recipient.name;
        }
    };
    if (staffId) {
        const staffProfile = await client_1.prisma.staffProfile.findFirst({
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
                isAssignedStaff: true,
                isManagement: false,
                name: staffProfile.display_name ||
                    staffProfile.user.first_name ||
                    staffProfile.user.name ||
                    "Staff",
                email: normalizeEmail(staffProfile.user.email),
                phone: buildFullPhone(staffProfile.user.phone_prefix, staffProfile.user.phoneNumber),
            });
        }
    }
    const managementUsers = await client_1.prisma.companyUser.findMany({
        where: {
            company_id: companyId,
            role: { in: [client_2.CompanyUserRole.OWNER, client_2.CompanyUserRole.ADMIN] },
            deleted_at: null,
        },
        select: {
            role: true,
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
    for (const companyUser of managementUsers) {
        upsertRecipient({
            userId: companyUser.user.id,
            role: companyUser.role === client_2.CompanyUserRole.ADMIN ? "admin" : "owner",
            isAssignedStaff: false,
            isManagement: true,
            name: companyUser.user.first_name || companyUser.user.name || "Admin",
            email: normalizeEmail(companyUser.user.email),
            phone: buildFullPhone(companyUser.user.phone_prefix, companyUser.user.phoneNumber),
        });
    }
    return Array.from(recipientsByUserId.values());
}
function recipientMatchesAudience(recipient, audience = "all") {
    if (audience === "none")
        return false;
    if (audience === "staff")
        return recipient.isAssignedStaff;
    if (audience === "management")
        return recipient.isManagement;
    return true;
}
function buildInternalWhatsappText(data, recipientRole) {
    const services = data.serviceNames.join(", ");
    const manageUrl = getManageBookingUrl(data.bookingId);
    const customerPhone = buildFullPhone(data.customerPhonePrefix, data.customerPhone) || "No disponible";
    const mapsLine = buildMapsLine(data);
    const intro = recipientRole === "staff"
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
        `Fecha: ${formatDate(data.startAt, "es", data.timeZone)}`,
        `Hora: ${formatTime(data.startAt, "es", data.timeZone)} – ${formatTime(data.endAt, "es", data.timeZone)}`,
        `Total: ${formatPrice(data.totalPriceCents)} Bs`,
        ...(mapsLine ? [mapsLine] : []),
        ``,
        `Gestionar reserva: ${manageUrl}`,
    ].join("\n");
}
function buildPendingManagementWhatsappText(data) {
    const services = data.serviceNames.join(", ");
    const manageUrl = getManageBookingUrl(data.bookingId);
    const customerPhone = buildFullPhone(data.customerPhonePrefix, data.customerPhone) || "No disponible";
    const mapsLine = buildMapsLine(data);
    return [
        "⏳ Nueva reserva pendiente de confirmación",
        ``,
        `Cliente: ${data.customerName || "Sin nombre"}`,
        `Teléfono: ${customerPhone}`,
        `Email: ${data.customerEmail || "No disponible"}`,
        `Staff: ${data.staffName || "No asignado"}`,
        `Servicios: ${services}`,
        `Fecha: ${formatDate(data.startAt, "es", data.timeZone)}`,
        `Hora: ${formatTime(data.startAt, "es", data.timeZone)} – ${formatTime(data.endAt, "es", data.timeZone)}`,
        `Total: ${formatPrice(data.totalPriceCents)} Bs`,
        ...(mapsLine ? [mapsLine] : []),
        ``,
        `Confirmar reserva: ${manageUrl}`,
    ].join("\n");
}
function buildStaffConfirmedWhatsappText(data) {
    const services = data.serviceNames.join(", ");
    const manageUrl = getManageBookingUrl(data.bookingId);
    const mapsLine = buildMapsLine(data);
    return [
        "✅ Reserva confirmada asignada",
        ``,
        `Cliente: ${data.customerName || "Sin nombre"}`,
        `Servicios: ${services}`,
        `Fecha: ${formatDate(data.startAt, "es", data.timeZone)}`,
        `Hora: ${formatTime(data.startAt, "es", data.timeZone)} – ${formatTime(data.endAt, "es", data.timeZone)}`,
        ...(mapsLine ? [mapsLine] : []),
        ``,
        `Ver reserva: ${manageUrl}`,
    ].join("\n");
}
function bookingInternalEmailHtml(data, recipient, options) {
    const serviceList = data.serviceNames.map((s) => `<li>${s}</li>`).join("");
    const manageUrl = getManageBookingUrl(data.bookingId);
    const customerPhone = buildFullPhone(data.customerPhonePrefix, data.customerPhone) || "No disponible";
    const heading = options?.heading || (recipient.role === "staff" ? "Nueva reserva asignada" : "Nueva reserva en tu tienda");
    const message = options?.message || "Se registró una nueva reserva. Aquí están los datos:";
    const locationHtml = buildLocationHtml(data, "Ubicación", "Ver en Google Maps");
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
        <p>${message}</p>
        <div class="details">
          <p><strong>Cliente:</strong> ${data.customerName || "Sin nombre"}</p>
          <p><strong>Teléfono cliente:</strong> ${customerPhone}</p>
          <p><strong>Email cliente:</strong> ${data.customerEmail || "No disponible"}</p>
          <p><strong>Negocio:</strong> ${data.companyName}</p>
          <p><strong>Staff:</strong> ${data.staffName || "No asignado"}</p>
          <p><strong>Fecha:</strong> ${formatDate(data.startAt, "es", data.timeZone)}</p>
          <p><strong>Hora:</strong> ${formatTime(data.startAt, "es", data.timeZone)} – ${formatTime(data.endAt, "es", data.timeZone)}</p>
          <p><strong>Servicios:</strong></p>
          <ul>${serviceList}</ul>
          <p><strong>Total:</strong> ${formatPrice(data.totalPriceCents)} Bs</p>
          ${locationHtml}
        </div>
        <a class="button" href="${manageUrl}">Gestionar reserva</a>
      </div>
    </body>
    </html>`;
}
// ─── EMAIL TEMPLATES ─────────────────────────────────────
function bookingEmailHtml(data, title, mainMessage, accentColor) {
    const serviceList = data.serviceNames.map((s) => `<li>${s}</li>`).join("");
    const locationHtml = buildLocationHtml(data, "Ubicación", "Ver en Google Maps");
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
          <p><strong>Fecha:</strong> ${formatDate(data.startAt, "es", data.timeZone)}</p>
          <p><strong>Hora:</strong> ${formatTime(data.startAt, "es", data.timeZone)} – ${formatTime(data.endAt, "es", data.timeZone)}</p>
          <p><strong>Servicios:</strong></p>
          <ul>${serviceList}</ul>
          <p><strong>Total:</strong> ${formatPrice(data.totalPriceCents)} Bs</p>
          ${locationHtml}
        </div>
        <div class="footer"><p>${data.companyName}</p></div>
      </div>
    </body>
    </html>`;
}
function bookingTodayReminderEmailHtml(data) {
    const locale = data.locale === "en" ? "en" : "es";
    const serviceList = data.serviceNames.map((s) => `<li>${s}</li>`).join("");
    const manageUrl = getCustomerManageBookingUrl(data.companySlug);
    const content = locale === "en"
        ? {
            title: "Reminder: your appointment is today",
            greeting: `Hi ${data.customerName || ""}, this is a reminder that your appointment is today.`,
            company: "Business",
            staff: "Professional",
            staffFallback: "Not assigned",
            date: "Date",
            time: "Time",
            services: "Services",
            total: "Total",
            location: "Location",
            locationLink: "Open in Google Maps",
            button: "Manage my appointment",
        }
        : {
            title: "Recordatorio de tu cita de hoy",
            greeting: `Hola ${data.customerName || ""}, te recordamos que tienes una cita hoy.`,
            company: "Negocio",
            staff: "Profesional",
            staffFallback: "No asignado",
            date: "Fecha",
            time: "Hora",
            services: "Servicios",
            total: "Total",
            location: "Ubicación",
            locationLink: "Ver en Google Maps",
            button: "Gestionar mi cita",
        };
    const locationHtml = buildLocationHtml(data, content.location, content.locationLink);
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${content.title}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
        .container { background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header h1 { color: #0369a1; font-size: 22px; margin-bottom: 16px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .details p { margin: 5px 0; }
        .button { display: inline-block; margin-top: 12px; padding: 10px 16px; border-radius: 6px; text-decoration: none; color: #fff; background: #0369a1; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>${content.title}</h1></div>
        <p>${content.greeting}</p>
        <div class="details">
          <p><strong>${content.company}:</strong> ${data.companyName}</p>
          <p><strong>${content.staff}:</strong> ${data.staffName || content.staffFallback}</p>
          <p><strong>${content.date}:</strong> ${formatDate(data.startAt, locale, data.timeZone)}</p>
          <p><strong>${content.time}:</strong> ${formatTime(data.startAt, locale, data.timeZone)} – ${formatTime(data.endAt, locale, data.timeZone)}</p>
          <p><strong>${content.services}:</strong></p>
          <ul>${serviceList}</ul>
          <p><strong>${content.total}:</strong> ${formatPrice(data.totalPriceCents)} Bs</p>
          ${locationHtml}
        </div>
        <a class="button" href="${manageUrl}">${content.button}</a>
      </div>
    </body>
    </html>`;
}
// ─── SEND HELPERS (fire-and-forget, never throw) ─────────
async function sendEmail(to, subject, html, companyId) {
    try {
        const result = await (0, sendEmail_1.sendGenericEmail)(to, subject, html, { companyId });
        return result.status === 'SENT';
    }
    catch (err) {
        logger_1.logger.error({ err, to }, "Failed to send booking notification email");
        return false;
    }
}
function mapWhatsappResultStatus(result) {
    const status = result.status === 'DUPLICATE' ? result.existingStatus : result.status;
    if (status === 'PROCESSING')
        return 'PROCESSING';
    if (status === 'SENT')
        return 'SENT';
    if (status === 'EXPIRED')
        return 'EXPIRED';
    if (status === 'CANCELLED')
        return 'CANCELLED';
    return 'PENDING';
}
async function sendWhatsapp(phone, text, data, sourceType, recipientKey = "customer", options) {
    try {
        const result = await (0, whatsappSender_1.queueWhatsappText)(phone, text, {
            companyId: data.companyId,
            branding: data.branding,
            sourceType,
            sourceId: `${data.bookingId}:${recipientKey}`,
            dedupeKey: `${sourceType}:${data.bookingId}:${recipientKey}:${phone}:${text}`,
            expiresAt: options?.expiresAt,
        });
        return {
            accepted: (0, whatsappSender_1.isWhatsappEnqueueAccepted)(result),
            status: (0, whatsappSender_1.isWhatsappEnqueueAccepted)(result) ? mapWhatsappResultStatus(result) : 'FAILED',
            jobId: result.jobId,
            reason: result.reason,
        };
    }
    catch (err) {
        logger_1.logger.error({ err, bookingId: data.bookingId, phone }, "Failed to queue booking WhatsApp notification");
        return { accepted: false, status: 'FAILED', reason: 'WHATSAPP_ENQUEUE_FAILED' };
    }
}
function brandEmail(data, title, html) {
    return (0, notificationBranding_1.renderBrandedEmail)({
        title,
        bodyHtml: html,
        branding: data.branding,
    });
}
function brandWhatsapp(data, text) {
    const withContactLine = (0, notificationBranding_1.appendCompanyContactLine)(text, data.branding);
    const directionsUrl = getCompanyDirectionsUrl(data);
    if (!directionsUrl || withContactLine.includes(directionsUrl)) {
        return withContactLine;
    }
    const mapsLine = buildMapsLine(data, "Ubicación");
    return mapsLine ? `${withContactLine.trim()}\n${mapsLine}` : withContactLine;
}
function buildWhatsappText(data, intro) {
    const services = data.serviceNames.join(", ");
    const mapsLine = buildMapsLine(data, "Mapa");
    return [
        `${intro}`,
        ``,
        `📍 ${data.companyName}`,
        `👤 ${data.staffName}`,
        `📅 ${formatDate(data.startAt, "es", data.timeZone)}`,
        `🕐 ${formatTime(data.startAt, "es", data.timeZone)} – ${formatTime(data.endAt, "es", data.timeZone)}`,
        `✂️ ${services}`,
        `💰 ${formatPrice(data.totalPriceCents)} Bs`,
        ...(mapsLine ? [mapsLine] : []),
    ].join("\n");
}
function buildTodayReminderWhatsappText(data) {
    const locale = data.locale === "en" ? "en" : "es";
    const services = data.serviceNames.join(", ");
    const manageUrl = getCustomerManageBookingUrl(data.companySlug);
    const mapsLine = buildMapsLine(data, locale === "en" ? "Map" : "Mapa");
    if (locale === "en") {
        return [
            `🔔 Hi ${data.customerName || ""}, this is a reminder that your appointment is today.`,
            ``,
            `📍 ${data.companyName}`,
            `👤 ${data.staffName || "Not assigned"}`,
            `📅 ${formatDate(data.startAt, locale, data.timeZone)}`,
            `🕐 ${formatTime(data.startAt, locale, data.timeZone)} – ${formatTime(data.endAt, locale, data.timeZone)}`,
            `✂️ ${services}`,
            `💰 ${formatPrice(data.totalPriceCents)} Bs`,
            ...(mapsLine ? [mapsLine] : []),
            ``,
            `Manage your appointment: ${manageUrl}`,
        ].join("\n");
    }
    return [
        `🔔 Hola ${data.customerName || ""}, te recordamos que tienes una cita hoy.`,
        ``,
        `📍 ${data.companyName}`,
        `👤 ${data.staffName || "No asignado"}`,
        `📅 ${formatDate(data.startAt, locale, data.timeZone)}`,
        `🕐 ${formatTime(data.startAt, locale, data.timeZone)} – ${formatTime(data.endAt, locale, data.timeZone)}`,
        `✂️ ${services}`,
        `💰 ${formatPrice(data.totalPriceCents)} Bs`,
        ...(mapsLine ? [mapsLine] : []),
        ``,
        `Gestiona tu cita: ${manageUrl}`,
    ].join("\n");
}
function buildNoShowDefaultMessage(data) {
    const locale = data.locale === "en" ? "en" : "es";
    const manageUrl = getCustomerManageBookingUrl(data.companySlug);
    if (locale === "en") {
        return [
            `Hi ${data.customerName || "there"},`,
            `we marked your appointment as no-show.`,
            `If you want to reschedule, please use this link: ${manageUrl}`,
        ].join(" ");
    }
    return [
        `Hola ${data.customerName || ""},`,
        `marcamos tu reserva como no asistida.`,
        `Si deseas reagendar, ingresa a este enlace por favor: ${manageUrl}`,
    ].join(" ");
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function bookingNoShowEmailHtml(data, message) {
    const locale = data.locale === "en" ? "en" : "es";
    const serviceList = data.serviceNames.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    const localized = locale === "en"
        ? {
            title: "No-show notice",
            greeting: `Hi ${escapeHtml(data.customerName || "")},`,
            company: "Business",
            staff: "Professional",
            date: "Date",
            time: "Time",
            services: "Services",
            total: "Total",
            location: "Location",
            locationLink: "Open in Google Maps",
        }
        : {
            title: "Aviso de no asistencia",
            greeting: `Hola ${escapeHtml(data.customerName || "")},`,
            company: "Negocio",
            staff: "Profesional",
            date: "Fecha",
            time: "Hora",
            services: "Servicios",
            total: "Total",
            location: "Ubicación",
            locationLink: "Ver en Google Maps",
        };
    const formattedMessage = escapeHtml(message).replace(/\n/g, "<br />");
    const locationHtml = buildLocationHtml(data, localized.location, localized.locationLink);
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${localized.title}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
        .container { background-color: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header h1 { color: #7c2d12; font-size: 22px; margin-bottom: 16px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .details p { margin: 5px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>${localized.title}</h1></div>
        <p>${localized.greeting}</p>
        <p>${formattedMessage}</p>
        <div class="details">
          <p><strong>${localized.company}:</strong> ${escapeHtml(data.companyName)}</p>
          <p><strong>${localized.staff}:</strong> ${escapeHtml(data.staffName || "")}</p>
          <p><strong>${localized.date}:</strong> ${formatDate(data.startAt, locale, data.timeZone)}</p>
          <p><strong>${localized.time}:</strong> ${formatTime(data.startAt, locale, data.timeZone)} – ${formatTime(data.endAt, locale, data.timeZone)}</p>
          <p><strong>${localized.services}:</strong></p>
          <ul>${serviceList}</ul>
          <p><strong>${localized.total}:</strong> ${formatPrice(data.totalPriceCents)} Bs</p>
          ${locationHtml}
        </div>
      </div>
    </body>
    </html>`;
}
// ─── PUBLIC API ──────────────────────────────────────────
/**
 * Send confirmation notification when a booking is created.
 * Checks company settings before sending. Fire-and-forget.
 */
async function notifyBookingCreated(data) {
    data = await withCompanyTimeZone(data);
    const [{ sendEmail: doEmail, sendWhatsapp: doWa }, audience] = await Promise.all([
        getNotificationSettings(data.companyId),
        getNotificationAudiencePolicy(data.companyId, data.serviceIds),
    ]);
    if (audience.customer && doEmail && data.customerEmail) {
        const html = bookingEmailHtml(data, "Reserva Confirmada", "Tu reserva ha sido creada exitosamente. Aquí están los detalles:", "#007bff");
        void sendEmail(data.customerEmail, `Reserva confirmada – ${data.companyName}`, brandEmail(data, "Reserva Confirmada", html), data.companyId);
    }
    if (audience.customer && doWa && data.customerPhone) {
        const phone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
        if (phone) {
            const text = buildWhatsappText(data, `✅ Hola ${data.customerName || ""}, tu reserva en ${data.companyName} ha sido confirmada.`);
            void sendWhatsapp(phone, brandWhatsapp(data, text), data, "BOOKING_CREATED");
        }
    }
    // Internal notifications (assigned staff + owners)
    if (doEmail || doWa) {
        try {
            const recipients = await getInternalRecipients(data.companyId, data.staffId);
            for (const recipient of recipients) {
                if (!recipientMatchesAudience(recipient, data.internalAudience)) {
                    continue;
                }
                const includedByPolicy = (recipient.isAssignedStaff && audience.assignedStaff) ||
                    (recipient.isManagement && audience.management);
                if (!includedByPolicy) {
                    continue;
                }
                if (doEmail && recipient.email) {
                    const subject = recipient.role === "staff"
                        ? `Nueva reserva asignada – ${data.companyName}`
                        : `Nueva reserva en tu tienda – ${data.companyName}`;
                    const html = bookingInternalEmailHtml(data, recipient);
                    void sendEmail(recipient.email, subject, brandEmail(data, subject, html), data.companyId);
                }
                if (doWa && recipient.phone) {
                    const text = buildInternalWhatsappText(data, recipient.role);
                    void sendWhatsapp(recipient.phone, brandWhatsapp(data, text), data, "BOOKING_CREATED_INTERNAL", recipient.userId);
                }
            }
        }
        catch (err) {
            logger_1.logger.error({ err, bookingId: data.bookingId }, "Failed to send internal booking notifications");
        }
    }
}
/**
 * Send a WhatsApp-only alert to owners/admins when a booking needs manual confirmation.
 */
async function notifyBookingPendingForManagement(data) {
    data = await withCompanyTimeZone(data);
    const [{ sendWhatsapp: doWa }, audience] = await Promise.all([
        getNotificationSettings(data.companyId),
        getNotificationAudiencePolicy(data.companyId, data.serviceIds),
    ]);
    if (!doWa || !audience.management)
        return;
    try {
        const recipients = await getInternalRecipients(data.companyId);
        const text = buildPendingManagementWhatsappText(data);
        for (const recipient of recipients) {
            if (!recipientMatchesAudience(recipient, "management") || !recipient.phone) {
                continue;
            }
            void sendWhatsapp(recipient.phone, brandWhatsapp(data, text), data, "BOOKING_PENDING_MANAGEMENT", recipient.userId);
        }
    }
    catch (err) {
        logger_1.logger.error({ err, bookingId: data.bookingId }, "Failed to send pending booking management notifications");
    }
}
/**
 * Notify only the assigned staff member when a pending booking is confirmed.
 */
async function notifyBookingConfirmedForStaff(data) {
    data = await withCompanyTimeZone(data);
    const [{ sendEmail: doEmail, sendWhatsapp: doWa }, audience] = await Promise.all([
        getNotificationSettings(data.companyId),
        getNotificationAudiencePolicy(data.companyId, data.serviceIds),
    ]);
    if (!data.staffId || !audience.assignedStaff || (!doEmail && !doWa))
        return;
    try {
        const recipients = (await getInternalRecipients(data.companyId, data.staffId)).filter((recipient) => recipientMatchesAudience(recipient, "staff"));
        for (const recipient of recipients) {
            if (doEmail && recipient.email) {
                const html = bookingInternalEmailHtml(data, {
                    ...recipient,
                    role: "staff",
                }, {
                    heading: "Reserva confirmada asignada",
                    message: "La reserva fue confirmada. Aquí están los datos:",
                });
                void sendEmail(recipient.email, `Reserva confirmada asignada – ${data.companyName}`, brandEmail(data, "Reserva confirmada asignada", html), data.companyId);
            }
            if (doWa && recipient.phone) {
                const text = buildStaffConfirmedWhatsappText(data);
                void sendWhatsapp(recipient.phone, brandWhatsapp(data, text), data, "BOOKING_CONFIRMED_STAFF", recipient.userId);
            }
        }
    }
    catch (err) {
        logger_1.logger.error({ err, bookingId: data.bookingId }, "Failed to send staff booking confirmation notification");
    }
}
/**
 * Send notification when a booking is updated (rescheduled, staff changed, etc.).
 */
async function notifyBookingUpdated(data) {
    data = await withCompanyTimeZone(data);
    const { sendEmail: doEmail, sendWhatsapp: doWa } = await getNotificationSettings(data.companyId);
    if (doEmail && data.customerEmail) {
        const html = bookingEmailHtml(data, "Reserva Actualizada", "Tu reserva ha sido modificada. Revisa los nuevos detalles:", "#f59e0b");
        void sendEmail(data.customerEmail, `Reserva actualizada – ${data.companyName}`, brandEmail(data, "Reserva Actualizada", html), data.companyId);
    }
    if (doWa && data.customerPhone) {
        const phone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
        if (phone) {
            const text = buildWhatsappText(data, `📝 Hola ${data.customerName || ""}, tu reserva en ${data.companyName} ha sido actualizada.`);
            void sendWhatsapp(phone, brandWhatsapp(data, text), data, "BOOKING_UPDATED");
        }
    }
}
/**
 * Send notification when a booking is cancelled.
 */
async function notifyBookingCancelled(data) {
    data = await withCompanyTimeZone(data);
    const { sendEmail: doEmail, sendWhatsapp: doWa } = await getNotificationSettings(data.companyId);
    if (doEmail && data.customerEmail) {
        const html = bookingEmailHtml(data, "Reserva Cancelada", "Tu reserva ha sido cancelada. Si esto fue un error, por favor contáctanos para reagendar.", "#dc3545");
        void sendEmail(data.customerEmail, `Reserva cancelada – ${data.companyName}`, brandEmail(data, "Reserva Cancelada", html), data.companyId);
    }
    if (doWa && data.customerPhone) {
        const phone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
        if (phone) {
            const text = buildWhatsappText(data, `❌ Hola ${data.customerName || ""}, tu reserva en ${data.companyName} ha sido cancelada.`);
            void sendWhatsapp(phone, brandWhatsapp(data, text), data, "BOOKING_CANCELLED");
        }
    }
}
/**
 * Send reminder for bookings occurring today.
 * Prefers WhatsApp if a phone number exists; falls back to email.
 */
async function notifyBookingTodayReminder(data) {
    data = await withCompanyTimeZone(data);
    const customerPhone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
    const customerEmail = normalizeEmail(data.customerEmail);
    const locale = data.locale === "en" ? "en" : "es";
    if (customerPhone) {
        const text = buildTodayReminderWhatsappText(data);
        const result = await sendWhatsapp(customerPhone, brandWhatsapp(data, text), data, "BOOKING_TODAY_REMINDER", "customer", { expiresAt: data.startAt });
        if (!result.accepted)
            return { sent: false, status: 'FAILED', reason: result.reason || "WHATSAPP_SEND_FAILED" };
        if (result.status === 'SENT')
            return { sent: true, channel: "WHATSAPP", status: 'SENT', jobId: result.jobId };
        return { sent: false, queued: true, channel: "WHATSAPP", status: result.status, jobId: result.jobId, reason: result.reason || 'QUEUED' };
    }
    if (customerEmail) {
        const html = bookingTodayReminderEmailHtml(data);
        const subject = locale === "en"
            ? `Today's appointment reminder – ${data.companyName}`
            : `Recordatorio de cita de hoy – ${data.companyName}`;
        const ok = await sendEmail(customerEmail, subject, brandEmail(data, subject, html), data.companyId);
        return ok
            ? { sent: true, channel: "EMAIL", status: 'SENT' }
            : { sent: false, status: 'FAILED', reason: "EMAIL_SEND_FAILED" };
    }
    return { sent: false, status: 'FAILED', reason: "NO_CONTACT" };
}
/**
 * Send no-show notification with manual channel selection and optional custom text.
 * AUTO prefers WhatsApp and falls back to email.
 */
async function notifyBookingNoShow(data) {
    data = await withCompanyTimeZone(data);
    const locale = data.locale === "en" ? "en" : "es";
    const customerPhone = buildFullPhone(data.customerPhonePrefix, data.customerPhone);
    const customerEmail = normalizeEmail(data.customerEmail);
    const preferred = data.preferredChannel || "AUTO";
    const message = (data.customMessage || "").trim() || buildNoShowDefaultMessage(data);
    if (preferred === "WHATSAPP") {
        if (!customerPhone)
            return { sent: false, reason: "NO_WHATSAPP_CONTACT" };
        const result = await sendWhatsapp(customerPhone, brandWhatsapp(data, message), data, "BOOKING_NO_SHOW");
        if (!result.accepted)
            return { sent: false, status: 'FAILED', reason: result.reason || "WHATSAPP_SEND_FAILED" };
        if (result.status === 'SENT')
            return { sent: true, channel: "WHATSAPP", status: 'SENT', jobId: result.jobId };
        return { sent: false, queued: true, channel: "WHATSAPP", status: result.status, jobId: result.jobId, reason: result.reason || 'QUEUED' };
    }
    if (preferred === "EMAIL") {
        if (!customerEmail)
            return { sent: false, reason: "NO_EMAIL_CONTACT" };
        const subject = locale === "en"
            ? `No-show notice – ${data.companyName}`
            : `Aviso de no asistencia – ${data.companyName}`;
        const html = bookingNoShowEmailHtml(data, message);
        const ok = await sendEmail(customerEmail, subject, brandEmail(data, subject, html), data.companyId);
        return ok ? { sent: true, channel: "EMAIL", status: 'SENT' } : { sent: false, status: 'FAILED', reason: "EMAIL_SEND_FAILED" };
    }
    if (customerPhone) {
        const result = await sendWhatsapp(customerPhone, brandWhatsapp(data, message), data, "BOOKING_NO_SHOW");
        if (result.accepted) {
            if (result.status === 'SENT')
                return { sent: true, channel: "WHATSAPP", status: 'SENT', jobId: result.jobId };
            return { sent: false, queued: true, channel: "WHATSAPP", status: result.status, jobId: result.jobId, reason: result.reason || 'QUEUED' };
        }
    }
    if (customerEmail) {
        const subject = locale === "en"
            ? `No-show notice – ${data.companyName}`
            : `Aviso de no asistencia – ${data.companyName}`;
        const html = bookingNoShowEmailHtml(data, message);
        const ok = await sendEmail(customerEmail, subject, brandEmail(data, subject, html), data.companyId);
        return ok ? { sent: true, channel: "EMAIL", status: 'SENT' } : { sent: false, status: 'FAILED', reason: "EMAIL_SEND_FAILED" };
    }
    return { sent: false, status: 'FAILED', reason: "NO_CONTACT" };
}
