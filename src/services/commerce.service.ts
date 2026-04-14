import {
    CommerceFulfillmentType,
    CommerceOrderStatus,
    CommerceOrderType,
    CommerceStockMovementType,
    PaymentMethod,
    PaymentStatus,
    Prisma,
} from '@prisma/client';
import { prisma } from '../prisma/client';
import type { AuthenticatedRequest } from '../middlewares/requireAuth';
import { sendGenericEmail, isTemporaryEmailAddress } from '../utils/sendEmail';
import { sendWhatsappText } from '../utils/whatsappSender';
import { logger } from '../config/logger';
import { buildShopUnavailablePayload, isCompanyAvailableNow } from '../utils/company-availability';
import { resolveCompanyModules } from './company-modules.service';
import { StorageService } from './storage.service';

type DbClient = typeof prisma | Prisma.TransactionClient;

type OrderActorScope = 'admin' | 'staff';

type PublicStorefrontAccessResult =
    | { ok: true; storefront: CommerceStorefront }
    | { ok: false; code: 403 | 404; message: string; payload?: { code: number; error: boolean; message: string; data?: unknown; reason?: string } };

export type CommerceIdentityMatch =
    | 'NONE'
    | 'SAME_USER'
    | 'EMAIL_ONLY'
    | 'PHONE_ONLY'
    | 'CONFLICT';

type CheckoutIdentity = {
    guest_name: string;
    guest_phone_prefix?: string | null;
    guest_phone?: string | null;
    guest_email?: string | null;
};

type CheckoutOrderItemInput = {
    product_id: number;
    quantity: number;
};

type CreateCommerceOrderInput = CheckoutIdentity & {
    fulfillment_type: CommerceFulfillmentType;
    order_type: CommerceOrderType;
    point_of_sale_id?: number | null;
    scheduled_date?: string | null;
    scheduled_timeframe?: string | null;
    delivery_address?: string | null;
    delivery_instructions?: string | null;
    qr_proof_image_url?: string | null;
    notes?: string | null;
    items: CheckoutOrderItemInput[];
};

type UpdateCommerceSettingsInput = {
    currency?: string | null;
    supports_pickup?: boolean;
    supports_delivery?: boolean;
    qr_payment_enabled?: boolean;
    qr_image_url?: string | null;
    support_phone?: string | null;
    asap_orders_enabled?: boolean;
    scheduled_orders_enabled?: boolean;
    hero_title?: string | null;
    hero_subtitle?: string | null;
    banner_image_url?: string | null;
};

type DeliveryRuleInput = {
    weekday: number;
    delivery_enabled: boolean;
    asap_enabled: boolean;
    scheduled_enabled: boolean;
    windows?: Array<{
        label: string;
        start_time?: string | null;
        end_time?: string | null;
    }>;
};

type ProductInput = {
    category_id?: number | null;
    name: string;
    description?: string | null;
    regular_price_cents: number;
    promotional_price_cents?: number | null;
    promo_valid_from?: string | null;
    promo_valid_until?: string | null;
    stock_quantity: number;
    is_active?: boolean;
    is_featured?: boolean;
    is_combo?: boolean;
    images?: string[];
};

type CategoryInput = {
    name: string;
    is_active?: boolean;
};

type PointOfSaleInput = {
    name: string;
    city: string;
    osm_link?: string | null;
    opening_hours_text?: string | null;
    support_phone?: string | null;
    pickup_enabled?: boolean;
    delivery_enabled?: boolean;
    is_active?: boolean;
};

type DeliveryRuleWindowLike = {
    id?: number;
    label: string;
    start_time?: string | null;
    end_time?: string | null;
    sort_order?: number;
};

type DeliveryRuleLike = {
    id?: number;
    weekday: number;
    delivery_enabled: boolean;
    asap_enabled: boolean;
    scheduled_enabled: boolean;
    windows: DeliveryRuleWindowLike[];
};

type CompanyHourLike = {
    day_of_week: number;
    open_time?: string | null;
    close_time?: string | null;
    is_closed: boolean;
};

type DeliveryRulesResolution = {
    rules: DeliveryRuleLike[];
    source: 'explicit' | 'company_hours';
};

type ProductPromoLike = {
    regular_price_cents: number;
    promotional_price_cents?: number | null;
    promo_valid_from?: Date | null;
    promo_valid_until?: Date | null;
};

const DEFAULT_SUPPORT_PHONE_PREFIX = '591';
const STORE_FEATURE = 'STORE_MODULE' as const;
const ORDER_STATUS_SEQUENCE: CommerceOrderStatus[] = [
    CommerceOrderStatus.NEW,
    CommerceOrderStatus.SCHEDULED,
    CommerceOrderStatus.ASSIGNED,
    CommerceOrderStatus.IN_PROCESS,
    CommerceOrderStatus.READY,
    CommerceOrderStatus.SENT,
    CommerceOrderStatus.DELIVERED,
    CommerceOrderStatus.CANCELLED,
];

const commerceStorefrontInclude = Prisma.validator<Prisma.CompanyInclude>()({
    company_settings: {
        select: {
            qr_image_url: true,
            reservations_enabled: true,
        },
    },
    commerce_settings: true,
    commerce_categories: {
        where: { deleted_at: null },
        orderBy: { sort_order: 'asc' },
    },
    commerce_products: {
        where: { deleted_at: null },
        orderBy: [{ is_featured: 'desc' }, { updated_at: 'desc' }],
        include: {
            images: {
                orderBy: { sort_order: 'asc' },
            },
        },
    },
    commerce_points_of_sale: {
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
    },
    commerce_delivery_rules: {
        orderBy: { weekday: 'asc' },
        include: {
            windows: {
                orderBy: { sort_order: 'asc' },
            },
        },
    },
    hours: {
        orderBy: [{ day_of_week: 'asc' }, { open_time: 'asc' }],
    },
});

type CommerceStorefront = Prisma.CompanyGetPayload<{
    include: typeof commerceStorefrontInclude;
}>;

function normalizeText(value?: string | null): string | null {
    const clean = (value || '').trim();
    return clean || null;
}

function normalizeCurrency(value?: string | null): string | null {
    const clean = normalizeText(value);
    if (!clean) return null;
    if (clean.length > 3) {
        throw new Error('currency must be between 1 and 3 characters');
    }
    return clean;
}

function normalizeEmail(value?: string | null): string | null {
    const clean = (value || '').trim().toLowerCase();
    return clean || null;
}

function normalizePhone(value?: string | null): string | null {
    const clean = (value || '').replace(/\D/g, '');
    return clean || null;
}

function normalizePhonePrefix(value?: string | null): string {
    const clean = (value || DEFAULT_SUPPORT_PHONE_PREFIX).replace(/\D/g, '');
    return clean || DEFAULT_SUPPORT_PHONE_PREFIX;
}

function buildFullPhone(prefix?: string | null, phone?: string | null): string | null {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return null;
    return `${normalizePhonePrefix(prefix)}${cleanPhone}`;
}

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 180) || `item-${Date.now()}`;
}

function isValidWeekday(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidTimeLabel(value?: string | null): boolean {
    if (value === undefined || value === null || value === '') return true;
    return /^\d{2}:\d{2}$/.test(value);
}

function parseDateOnly(value?: string | null): Date | null {
    const clean = normalizeText(value);
    if (!clean) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
    const parsed = new Date(`${clean}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateBoundary(value?: string | null, boundary: 'start' | 'end' = 'start'): Date | null {
    const clean = normalizeText(value);
    if (!clean) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        throw new Error('Promotion dates must use YYYY-MM-DD format');
    }

    const suffix = boundary === 'end' ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const parsed = new Date(`${clean}${suffix}`);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Invalid promotion date');
    }
    return parsed;
}

function getWeekdayFromDate(date: Date): number {
    return date.getUTCDay();
}

function buildWindowLabel(startTime?: string | null, endTime?: string | null): string {
    const start = normalizeText(startTime);
    const end = normalizeText(endTime);
    if (start && end) {
        return `${start}-${end}`;
    }
    return start || end || 'Window';
}

function mapDeliveryRuleWindow(window: DeliveryRuleWindowLike, index = 0) {
    return {
        id: window.id,
        label: window.label,
        start_time: window.start_time ?? null,
        end_time: window.end_time ?? null,
        sort_order: window.sort_order ?? index,
    };
}

export function buildDefaultDeliveryRulesFromHours(hours: CompanyHourLike[]): DeliveryRuleLike[] {
    const windowsByDay = new Map<number, DeliveryRuleWindowLike[]>();

    for (const hour of hours) {
        if (
            hour.is_closed
            || !isValidWeekday(hour.day_of_week)
            || !hour.open_time
            || !hour.close_time
        ) {
            continue;
        }

        const list = windowsByDay.get(hour.day_of_week) ?? [];
        list.push({
            label: buildWindowLabel(hour.open_time, hour.close_time),
            start_time: hour.open_time,
            end_time: hour.close_time,
            sort_order: list.length,
        });
        windowsByDay.set(hour.day_of_week, list);
    }

    return Array.from({ length: 7 }, (_, weekday) => {
        const windows = (windowsByDay.get(weekday) ?? []).sort((a, b) => {
            const aStart = a.start_time ?? '';
            const bStart = b.start_time ?? '';
            return aStart.localeCompare(bStart);
        });

        const isEnabled = windows.length > 0;
        return {
            weekday,
            delivery_enabled: isEnabled,
            asap_enabled: isEnabled,
            scheduled_enabled: isEnabled,
            windows: windows.map((window, index) => mapDeliveryRuleWindow(window, index)),
        };
    });
}

export function resolveDeliveryRulesWithHoursFallback(
    explicitRules: DeliveryRuleLike[],
    hours: CompanyHourLike[],
): DeliveryRulesResolution {
    if (explicitRules.length > 0) {
        return {
            source: 'explicit',
            rules: explicitRules
                .map((rule) => ({
                    id: rule.id,
                    weekday: rule.weekday,
                    delivery_enabled: rule.delivery_enabled,
                    asap_enabled: rule.asap_enabled,
                    scheduled_enabled: rule.scheduled_enabled,
                    windows: (rule.windows || [])
                        .map((window, index) => mapDeliveryRuleWindow(window, index))
                        .sort((a, b) => a.sort_order - b.sort_order),
                }))
                .sort((a, b) => a.weekday - b.weekday),
        };
    }

    return {
        source: 'company_hours',
        rules: buildDefaultDeliveryRulesFromHours(hours),
    };
}

export function isCommercePromotionActive(
    product: ProductPromoLike,
    referenceDate: Date = new Date(),
): boolean {
    if (!Number.isInteger(product.promotional_price_cents ?? undefined)) {
        return false;
    }

    if (product.promo_valid_from && referenceDate < product.promo_valid_from) {
        return false;
    }

    if (product.promo_valid_until && referenceDate > product.promo_valid_until) {
        return false;
    }

    return true;
}

export function getEffectiveCommerceUnitPriceCents(
    product: ProductPromoLike,
    referenceDate: Date = new Date(),
): number {
    return isCommercePromotionActive(product, referenceDate)
        ? (product.promotional_price_cents ?? product.regular_price_cents)
        : product.regular_price_cents;
}

function normalizeStorageRelativePath(rawUrl: string | null | undefined): string | null {
    if (!rawUrl) return null;
    let normalized = rawUrl.trim();
    if (!normalized) return null;

    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        try {
            normalized = new URL(normalized).pathname;
        } catch {
            return null;
        }
    }

    const pathWithoutQuery = normalized.split(/[?#]/, 1)[0];
    if (pathWithoutQuery.startsWith('/api/storage/')) {
        return pathWithoutQuery.slice('/api/storage/'.length);
    }
    const uploadsIndex = pathWithoutQuery.indexOf('/uploads/');
    if (uploadsIndex >= 0) {
        return pathWithoutQuery.slice(uploadsIndex + 1);
    }
    return null;
}

async function deleteStoredImageIfOwned(companyId: number, imageUrl?: string | null) {
    const relativePath = normalizeStorageRelativePath(imageUrl);
    if (!relativePath || !relativePath.startsWith(`uploads/${companyId}/`)) {
        return;
    }

    await StorageService.deleteFile(relativePath).catch(() => undefined);
}

function normalizeOsmLink(value?: string | null): string | null {
    const clean = normalizeText(value);
    if (!clean) return null;

    try {
        const parsed = new URL(clean);
        if (!parsed.hostname.includes('openstreetmap.org')) {
            throw new Error('OpenStreetMap link must use openstreetmap.org');
        }
        return parsed.toString();
    } catch (error) {
        if (error instanceof Error && error.message.includes('openstreetmap.org')) {
            throw error;
        }
        throw new Error('Invalid OpenStreetMap link');
    }
}

function normalizePromoSchedule(input: Pick<ProductInput, 'promotional_price_cents' | 'promo_valid_from' | 'promo_valid_until'>) {
    const promotionalPrice = input.promotional_price_cents ?? null;
    const promoValidFrom = parseDateBoundary(input.promo_valid_from, 'start');
    const promoValidUntil = parseDateBoundary(input.promo_valid_until, 'end');

    if ((promoValidFrom || promoValidUntil) && promotionalPrice === null) {
        throw new Error('promotional_price_cents is required when promotion dates are set');
    }

    if (promoValidFrom && promoValidUntil && promoValidUntil < promoValidFrom) {
        throw new Error('promo_valid_until must be on or after promo_valid_from');
    }

    return {
        promotional_price_cents: promotionalPrice,
        promo_valid_from: promoValidFrom,
        promo_valid_until: promoValidUntil,
    };
}

export function isStatusTransitionAllowed(
    currentStatus: CommerceOrderStatus,
    nextStatus: CommerceOrderStatus,
    scope: OrderActorScope,
): boolean {
    if (currentStatus === nextStatus) return true;
    if (nextStatus === CommerceOrderStatus.CANCELLED) {
        return scope === 'admin';
    }

    if (scope === 'staff') {
        const allowedTargets = new Set<CommerceOrderStatus>([
            CommerceOrderStatus.IN_PROCESS,
            CommerceOrderStatus.READY,
            CommerceOrderStatus.SENT,
            CommerceOrderStatus.DELIVERED,
        ]);
        if (!allowedTargets.has(nextStatus)) return false;
    }

    const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(currentStatus);
    const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(nextStatus);
    if (currentIndex < 0 || nextIndex < 0) return false;

    if (currentStatus === CommerceOrderStatus.SCHEDULED && nextStatus === CommerceOrderStatus.ASSIGNED) {
        return true;
    }

    return nextIndex >= currentIndex && nextIndex - currentIndex <= 2;
}

export function isPaymentStatusTransitionAllowed(
    currentStatus: PaymentStatus,
    nextStatus: PaymentStatus,
): boolean {
    if (currentStatus === nextStatus) return true;

    switch (currentStatus) {
        case PaymentStatus.UNPAID:
            return nextStatus === PaymentStatus.PAID || nextStatus === PaymentStatus.PENDING_CONFIRMATION;
        case PaymentStatus.PENDING_CONFIRMATION:
            return nextStatus === PaymentStatus.PAID || nextStatus === PaymentStatus.REJECTED;
        case PaymentStatus.REJECTED:
            return nextStatus === PaymentStatus.PENDING_CONFIRMATION || nextStatus === PaymentStatus.PAID;
        case PaymentStatus.PAID:
            return false;
        default:
            return false;
    }
}

async function ensureCommerceSettings(companyId: number, db: DbClient = prisma) {
    const existing = await db.commerceSettings.findUnique({
        where: { company_id: companyId },
    });

    if (existing) return existing;

    return db.commerceSettings.create({
        data: {
            company_id: companyId,
            store_enabled: false,
            supports_pickup: true,
            supports_delivery: false,
            qr_payment_enabled: true,
            asap_orders_enabled: true,
            scheduled_orders_enabled: false,
        },
    });
}

async function ensureCustomerProfileForUser(companyId: number, userId: string, db: DbClient) {
    const existing = await db.customerProfile.findUnique({
        where: {
            company_id_user_id: {
                company_id: companyId,
                user_id: userId,
            },
        },
    });

    if (existing) return existing;

    const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true },
    });
    if (!user) return null;

    return db.customerProfile.create({
        data: {
            company_id: companyId,
            user_id: userId,
        },
    });
}

export function classifyCommerceIdentityMatch(
    emailUserId?: string | null,
    phoneUserId?: string | null,
): CommerceIdentityMatch {
    if (emailUserId && phoneUserId) {
        return emailUserId === phoneUserId ? 'SAME_USER' : 'CONFLICT';
    }

    if (emailUserId) return 'EMAIL_ONLY';
    if (phoneUserId) return 'PHONE_ONLY';
    return 'NONE';
}

async function findLinkableCustomerProfile(params: {
    companyId: number;
    authUser?: AuthenticatedRequest['authUser'];
    guestEmail?: string | null;
    guestPhone?: string | null;
    guestPhonePrefix?: string | null;
    db: DbClient;
}) {
    const { companyId, authUser, db } = params;
    if (authUser?.id) {
        return ensureCustomerProfileForUser(companyId, authUser.id, db);
    }

    const email = normalizeEmail(params.guestEmail);
    const phone = normalizePhone(params.guestPhone);
    const phonePrefix = normalizePhonePrefix(params.guestPhonePrefix);

    const [userByEmail, userByPhone] = await Promise.all([
        email
            ? db.user.findUnique({
                  where: { email },
                  select: { id: true },
              })
            : Promise.resolve(null),
        phone
            ? db.user.findFirst({
                  where: {
                      phoneNumber: phone,
                      phone_prefix: phonePrefix,
                  },
                  select: { id: true },
              })
            : Promise.resolve(null),
    ]);

    const matchType = classifyCommerceIdentityMatch(userByEmail?.id, userByPhone?.id);
    const matchedUserId =
        matchType === 'SAME_USER'
            ? userByEmail?.id ?? null
            : matchType === 'EMAIL_ONLY'
              ? userByEmail?.id ?? null
              : matchType === 'PHONE_ONLY'
                ? userByPhone?.id ?? null
                : null;

    if (!matchedUserId) return null;

    return ensureCustomerProfileForUser(companyId, matchedUserId, db);
}

async function getStaffProfileForUser(companyId: number, userId: string, db: DbClient = prisma) {
    return db.staffProfile.findFirst({
        where: {
            company_id: companyId,
            user_id: userId,
            deleted_at: null,
        },
        select: {
            id: true,
            display_name: true,
        },
    });
}

export function buildTrackingWhatsappText(params: {
    brandName: string;
    trackingLink: string;
    supportPhone?: string | null;
}) {
    const supportText = params.supportPhone
        ? ` Para cualquier duda o consulta, por favor contáctate con ${params.supportPhone}.`
        : '';

    return `Hola! Tu pedido de ${params.brandName} ya está en camino. Aquí puedes hacerle seguimiento: ${params.trackingLink}.${supportText}`.trim();
}

export function buildTrackingEmailHtml(params: {
    brandName: string;
    trackingLink: string;
    supportPhone?: string | null;
}) {
    const supportLine = params.supportPhone
        ? `<p>Para cualquier duda o consulta, por favor contáctate con <strong>${params.supportPhone}</strong>.</p>`
        : '';

    return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 620px; margin: 0 auto; padding: 24px; background: #f8fafc;">
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
                <h2 style="margin-top: 0;">Tu pedido ya está en camino</h2>
                <p>Hola! Tu pedido de <strong>${params.brandName}</strong> ya está en camino.</p>
                <p>
                    <a href="${params.trackingLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;">
                        Ver seguimiento
                    </a>
                </p>
                ${supportLine}
            </div>
        </div>
    `;
}

async function notifyTrackingIfPossible(orderId: number, db: DbClient = prisma) {
    const order = await db.commerceOrder.findUnique({
        where: { id: orderId },
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    company_settings: {
                        select: {
                            send_email_notifications: true,
                            send_whatsapp_notifications: true,
                        },
                    },
                },
            },
            customer_profile: {
                include: {
                    user: {
                        select: {
                            email: true,
                            phoneNumber: true,
                            phone_prefix: true,
                        },
                    },
                },
            },
        },
    });

    if (!order?.tracking_link) return;

    const supportPhone = order.support_phone_snapshot || null;
    const whatsappText = buildTrackingWhatsappText({
        brandName: order.company.name,
        trackingLink: order.tracking_link,
        supportPhone,
    });
    const emailHtml = buildTrackingEmailHtml({
        brandName: order.company.name,
        trackingLink: order.tracking_link,
        supportPhone,
    });

    const emailEnabled = order.company.company_settings?.send_email_notifications ?? true;
    const whatsappEnabled = order.company.company_settings?.send_whatsapp_notifications ?? false;
    const customerEmail = normalizeEmail(order.customer_profile?.user?.email || order.guest_email);
    const customerPhone = buildFullPhone(
        order.customer_profile?.user?.phone_prefix || order.guest_phone_prefix,
        order.customer_profile?.user?.phoneNumber || order.guest_phone,
    );

    if (whatsappEnabled && customerPhone) {
        void sendWhatsappText(customerPhone, whatsappText).catch((error) => {
            logger.error({ orderId, error }, 'Failed to send commerce tracking WhatsApp notification');
        });
        return;
    }

    if (emailEnabled && customerEmail && !isTemporaryEmailAddress(customerEmail)) {
        void sendGenericEmail(customerEmail, `Tu pedido ya está en camino – ${order.company.name}`, emailHtml).catch((error) => {
            logger.error({ orderId, error }, 'Failed to send commerce tracking email notification');
        });
    }
}

function buildStorefrontResponse(storefront: CommerceStorefront | null) {
    if (!storefront?.commerce_settings || !storefront.commerce_settings.store_enabled) {
        return null;
    }

    const deliveryRulesResolution = resolveDeliveryRulesWithHoursFallback(
        storefront.commerce_delivery_rules.map((rule) => ({
            id: rule.id,
            weekday: rule.weekday,
            delivery_enabled: rule.delivery_enabled,
            asap_enabled: rule.asap_enabled,
            scheduled_enabled: rule.scheduled_enabled,
            windows: rule.windows.map((window) => ({
                id: window.id,
                label: window.label,
                start_time: window.start_time,
                end_time: window.end_time,
                sort_order: window.sort_order,
            })),
        })),
        storefront.hours.map((hour) => ({
            day_of_week: hour.day_of_week,
            open_time: hour.open_time,
            close_time: hour.close_time,
            is_closed: hour.is_closed,
        })),
    );

    const categories = storefront.commerce_categories
        .filter((category) => category.is_active && !category.deleted_at)
        .map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            sort_order: category.sort_order,
            is_active: category.is_active,
        }));

    const products = storefront.commerce_products
        .filter((product) => product.is_active && !product.deleted_at)
        .map((product) => ({
            id: product.id,
            category_id: product.category_id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            regular_price_cents: product.regular_price_cents,
            promotional_price_cents: product.promotional_price_cents,
            promo_valid_from: product.promo_valid_from,
            promo_valid_until: product.promo_valid_until,
            promotion_active: isCommercePromotionActive(product),
            effective_price_cents: getEffectiveCommerceUnitPriceCents(product),
            stock_quantity: product.stock_quantity,
            is_active: product.is_active,
            is_featured: product.is_featured,
            is_combo: product.is_combo,
            images: product.images
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((image) => image.image_url),
        }));

    const pointsOfSale = storefront.commerce_points_of_sale
        .filter((point) => point.is_active)
        .map((point) => ({
            id: point.id,
            name: point.name,
            city: point.city,
            osm_link: point.google_maps_link,
            opening_hours_text: point.opening_hours_text,
            support_phone: point.support_phone,
            pickup_enabled: point.pickup_enabled,
            delivery_enabled: point.delivery_enabled,
            is_active: point.is_active,
        }));

    return {
        settings: {
            store_enabled: storefront.commerce_settings.store_enabled,
            currency: storefront.currency,
            supports_pickup: storefront.commerce_settings.supports_pickup,
            supports_delivery: storefront.commerce_settings.supports_delivery,
            qr_payment_enabled: storefront.commerce_settings.qr_payment_enabled,
            qr_image_url: storefront.commerce_settings.qr_image_url || storefront.company_settings?.qr_image_url || null,
            support_phone: storefront.commerce_settings.support_phone || storefront.phone,
            asap_orders_enabled: storefront.commerce_settings.asap_orders_enabled,
            scheduled_orders_enabled: storefront.commerce_settings.scheduled_orders_enabled,
            hero_title: storefront.commerce_settings.hero_title,
            hero_subtitle: storefront.commerce_settings.hero_subtitle,
            banner_image_url: storefront.commerce_settings.banner_image_url || storefront.home_hero_image_url || null,
        },
        categories,
        products,
        points_of_sale: pointsOfSale,
        delivery_rules: deliveryRulesResolution.rules,
        delivery_rules_source: deliveryRulesResolution.source,
    };
}

export function validateDeliverySchedulingRule(rule: {
    delivery_enabled: boolean;
    scheduled_enabled: boolean;
    windows: Array<{ label: string }>;
}, scheduledTimeframe?: string | null) {
    if (!rule.delivery_enabled || !rule.scheduled_enabled) {
        return {
            ok: false as const,
            message: 'Selected delivery date is unavailable',
        };
    }

    const requestedTimeframe = normalizeText(scheduledTimeframe);
    if (requestedTimeframe && !rule.windows.some((window) => window.label === requestedTimeframe)) {
        return {
            ok: false as const,
            message: 'Selected delivery timeframe is unavailable',
        };
    }

    return {
        ok: true as const,
        scheduledTimeframe: requestedTimeframe,
    };
}

async function getCompanyStorefrontBySlug(slug: string, db: DbClient = prisma) {
    return db.company.findUnique({
        where: { slug, is_active: true },
        include: commerceStorefrontInclude,
    });
}

export async function resolvePublicCommerceStorefrontAccess(
    slug: string,
    db: DbClient = prisma,
): Promise<PublicStorefrontAccessResult> {
    const storefront = await getCompanyStorefrontBySlug(slug, db);
    if (!storefront) {
        return {
            ok: false,
            code: 404,
            message: 'Storefront not found',
        };
    }

    if (!isCompanyAvailableNow(storefront)) {
        return {
            ok: false,
            code: 403,
            message: 'Storefront unavailable',
            payload: buildShopUnavailablePayload(storefront.availableUntil),
        };
    }

    const modules = resolveCompanyModules({
        plan: storefront.plan,
        reservations_enabled: storefront.company_settings?.reservations_enabled,
        store_enabled: storefront.commerce_settings?.store_enabled,
    });

    if (!modules.store) {
        return {
            ok: false,
            code: 404,
            message: 'Storefront not found',
        };
    }

    return { ok: true, storefront };
}

export async function getPublicCommerceStorefront(slug: string) {
    const access = await resolvePublicCommerceStorefrontAccess(slug);
    return access.ok ? buildStorefrontResponse(access.storefront) : null;
}

export async function getPublicCommerceAvailability(slug: string) {
    const access = await resolvePublicCommerceStorefrontAccess(slug);
    const commerce = access.ok ? buildStorefrontResponse(access.storefront) : null;
    if (!commerce) return null;

    return {
        supports_pickup: commerce.settings.supports_pickup,
        supports_delivery: commerce.settings.supports_delivery,
        asap_orders_enabled: commerce.settings.asap_orders_enabled,
        scheduled_orders_enabled: commerce.settings.scheduled_orders_enabled,
        delivery_rules: commerce.delivery_rules,
        delivery_rules_source: commerce.delivery_rules_source,
        points_of_sale: commerce.points_of_sale,
    };
}

export async function getPublicCommerceProduct(slug: string, productId: number) {
    const access = await resolvePublicCommerceStorefrontAccess(slug);
    const commerce = access.ok ? buildStorefrontResponse(access.storefront) : null;
    if (!commerce) return null;
    return commerce.products.find((product) => product.id === productId) ?? null;
}

async function validateOrderScheduling(params: {
    companyId: number;
    fulfillmentType: CommerceFulfillmentType;
    orderType: CommerceOrderType;
    scheduledDate?: string | null;
    scheduledTimeframe?: string | null;
    db: DbClient;
}) {
    if (params.orderType === CommerceOrderType.ASAP) {
        return {
            scheduledDate: null as Date | null,
            scheduledTimeframe: null as string | null,
        };
    }

    const scheduledDate = parseDateOnly(params.scheduledDate);
    if (!scheduledDate) {
        throw new Error('scheduled_date is required for scheduled orders');
    }

    if (scheduledDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        throw new Error('scheduled_date must be in the future');
    }

    if (params.fulfillmentType === CommerceFulfillmentType.DELIVERY) {
        const weekday = getWeekdayFromDate(scheduledDate);
        const [explicitRules, hours] = await Promise.all([
            params.db.commerceDeliveryAvailabilityRule.findMany({
                where: { company_id: params.companyId },
                orderBy: { weekday: 'asc' },
                include: {
                    windows: {
                        orderBy: { sort_order: 'asc' },
                    },
                },
            }),
            params.db.hours.findMany({
                where: { company_id: params.companyId },
                orderBy: [{ day_of_week: 'asc' }, { open_time: 'asc' }],
            }),
        ]);

        const resolvedRules = resolveDeliveryRulesWithHoursFallback(
            explicitRules.map((rule) => ({
                id: rule.id,
                weekday: rule.weekday,
                delivery_enabled: rule.delivery_enabled,
                asap_enabled: rule.asap_enabled,
                scheduled_enabled: rule.scheduled_enabled,
                windows: rule.windows.map((window) => ({
                    id: window.id,
                    label: window.label,
                    start_time: window.start_time,
                    end_time: window.end_time,
                    sort_order: window.sort_order,
                })),
            })),
            hours.map((hour) => ({
                day_of_week: hour.day_of_week,
                open_time: hour.open_time,
                close_time: hour.close_time,
                is_closed: hour.is_closed,
            })),
        );
        const rule = resolvedRules.rules.find((item) => item.weekday === weekday);

        if (!rule || !rule.delivery_enabled || !rule.scheduled_enabled) {
            throw new Error('Selected delivery date is unavailable');
        }

        const deliveryRuleCheck = validateDeliverySchedulingRule(rule, params.scheduledTimeframe);
        if (!deliveryRuleCheck.ok) {
            throw new Error(deliveryRuleCheck.message);
        }

        return {
            scheduledDate,
            scheduledTimeframe: deliveryRuleCheck.scheduledTimeframe,
        };
    }

    return {
        scheduledDate,
        scheduledTimeframe: normalizeText(params.scheduledTimeframe),
    };
}

async function validatePointOfSale(params: {
    companyId: number;
    pointOfSaleId?: number | null;
    fulfillmentType: CommerceFulfillmentType;
    db: DbClient;
}) {
    const pointId = params.pointOfSaleId ?? null;
    if (!pointId) return null;

    const point = await params.db.commercePointOfSale.findFirst({
        where: {
            id: pointId,
            company_id: params.companyId,
            is_active: true,
        },
    });

    if (!point) {
        throw new Error('Point of sale not found');
    }

    if (params.fulfillmentType === CommerceFulfillmentType.PICKUP && !point.pickup_enabled) {
        throw new Error('Selected point of sale does not support pickup');
    }

    if (params.fulfillmentType === CommerceFulfillmentType.DELIVERY && !point.delivery_enabled) {
        throw new Error('Selected point of sale does not support delivery');
    }

    return point;
}

export async function createPublicCommerceOrder(
    slug: string,
    input: CreateCommerceOrderInput,
    authUser?: AuthenticatedRequest['authUser'],
) {
    const access = await resolvePublicCommerceStorefrontAccess(slug);
    if (!access.ok) {
        return access.payload ?? {
            code: access.code,
            error: true,
            message: access.message,
        };
    }

    const storefront = access.storefront;
    if (!storefront.commerce_settings?.store_enabled) {
        return {
            code: 404,
            error: true,
            message: 'Storefront not available',
        };
    }

    const companyId = storefront.id;
    const guestName = normalizeText(input.guest_name);
    if (!guestName) {
        return { code: 400, error: true, message: 'guest_name is required' };
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
        return { code: 400, error: true, message: 'At least one order item is required' };
    }

    const guestPhone = normalizePhone(input.guest_phone);
    const guestPhonePrefix = normalizePhonePrefix(input.guest_phone_prefix);
    const guestEmail = normalizeEmail(input.guest_email);
    const deliveryAddress = normalizeText(input.delivery_address);

    if (input.fulfillment_type === CommerceFulfillmentType.DELIVERY && !deliveryAddress) {
        return {
            code: 400,
            error: true,
            message: 'delivery_address is required for delivery orders',
        };
    }

    if (!storefront.commerce_settings.qr_payment_enabled) {
        return { code: 400, error: true, message: 'QR payment is not enabled for this store' };
    }

    try {
        const createdOrder = await prisma.$transaction(async (tx) => {
            const settings = await ensureCommerceSettings(companyId, tx);
            if (!settings.store_enabled) {
                throw new Error('Storefront not available');
            }

            if (input.fulfillment_type === CommerceFulfillmentType.PICKUP && !settings.supports_pickup) {
                throw new Error('Pickup is not available');
            }
            if (input.fulfillment_type === CommerceFulfillmentType.DELIVERY && !settings.supports_delivery) {
                throw new Error('Delivery is not available');
            }
            if (input.order_type === CommerceOrderType.ASAP && !settings.asap_orders_enabled) {
                throw new Error('ASAP orders are not available');
            }
            if (input.order_type === CommerceOrderType.SCHEDULED && !settings.scheduled_orders_enabled) {
                throw new Error('Scheduled orders are not available');
            }

            const [linkedCustomer, validatedPointOfSale, schedule] = await Promise.all([
                findLinkableCustomerProfile({
                    companyId,
                    authUser,
                    guestEmail,
                    guestPhone,
                    guestPhonePrefix,
                    db: tx,
                }),
                validatePointOfSale({
                    companyId,
                    pointOfSaleId: input.point_of_sale_id,
                    fulfillmentType: input.fulfillment_type,
                    db: tx,
                }),
                validateOrderScheduling({
                    companyId,
                    fulfillmentType: input.fulfillment_type,
                    orderType: input.order_type,
                    scheduledDate: input.scheduled_date,
                    scheduledTimeframe: input.scheduled_timeframe,
                    db: tx,
                }),
            ]);

            const productIds = input.items.map((item) => item.product_id);
            const products = await tx.commerceProduct.findMany({
                where: {
                    company_id: companyId,
                    id: { in: productIds },
                    deleted_at: null,
                    is_active: true,
                },
            });

            if (products.length !== productIds.length) {
                throw new Error('One or more products are unavailable');
            }

            const productMap = new Map(products.map((product) => [product.id, product]));
            let subtotalCents = 0;

            for (const item of input.items) {
                if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
                    throw new Error('Each quantity must be a positive integer');
                }
                const product = productMap.get(item.product_id);
                if (!product) {
                    throw new Error('Product not found');
                }
                if (product.stock_quantity < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.name}`);
                }
                const price = getEffectiveCommerceUnitPriceCents(product);
                subtotalCents += price * item.quantity;
            }

            const supportPhoneSnapshot = settings.support_phone || storefront.phone || null;

            const order = await tx.commerceOrder.create({
                data: {
                    company_id: companyId,
                    customer_profile_id: linkedCustomer?.id ?? null,
                    guest_name: guestName,
                    guest_phone_prefix: guestPhone ? guestPhonePrefix : null,
                    guest_phone: guestPhone,
                    guest_email: guestEmail,
                    delivery_address: deliveryAddress,
                    delivery_instructions: normalizeText(input.delivery_instructions),
                    point_of_sale_id: validatedPointOfSale?.id ?? null,
                    fulfillment_type: input.fulfillment_type,
                    order_type: input.order_type,
                    scheduled_date: schedule.scheduledDate,
                    scheduled_timeframe: schedule.scheduledTimeframe,
                    status:
                        input.order_type === CommerceOrderType.SCHEDULED
                            ? CommerceOrderStatus.SCHEDULED
                            : CommerceOrderStatus.NEW,
                    payment_method: PaymentMethod.QR,
                    payment_status: PaymentStatus.PENDING_CONFIRMATION,
                    subtotal_cents: subtotalCents,
                    discount_total_cents: 0,
                    total_cents: subtotalCents,
                    support_phone_snapshot: supportPhoneSnapshot,
                    qr_proof_image_url: typeof input.qr_proof_image_url === 'string' ? input.qr_proof_image_url : null,
                    notes: normalizeText(input.notes),
                },
            });

            for (const item of input.items) {
                const product = productMap.get(item.product_id)!;
                const unitPrice = product.regular_price_cents;
                const promoPrice = isCommercePromotionActive(product)
                    ? product.promotional_price_cents ?? null
                    : null;
                const effectivePrice = promoPrice ?? unitPrice;

                const stockUpdated = await tx.commerceProduct.updateMany({
                    where: {
                        id: product.id,
                        company_id: companyId,
                        stock_quantity: {
                            gte: item.quantity,
                        },
                    },
                    data: {
                        stock_quantity: {
                            decrement: item.quantity,
                        },
                    },
                });

                if (stockUpdated.count !== 1) {
                    throw new Error(`Insufficient stock for ${product.name}`);
                }

                await tx.commerceOrderItem.create({
                    data: {
                        order_id: order.id,
                        product_id: product.id,
                        product_name_snapshot: product.name,
                        unit_price_cents_snapshot: unitPrice,
                        promotional_unit_price_cents_snapshot: promoPrice,
                        quantity: item.quantity,
                        subtotal_cents: effectivePrice * item.quantity,
                    },
                });

                await tx.commerceStockMovement.create({
                    data: {
                        company_id: companyId,
                        product_id: product.id,
                        order_id: order.id,
                        movement_type: CommerceStockMovementType.OUT,
                        quantity: item.quantity,
                        reason: input.order_type === CommerceOrderType.SCHEDULED ? 'Scheduled order created' : 'Order created',
                        created_by_id: authUser?.id ?? null,
                    },
                });
            }

            return tx.commerceOrder.findUnique({
                where: { id: order.id },
                include: {
                    items: true,
                    point_of_sale: true,
                    company: {
                        select: {
                            name: true,
                        },
                    },
                },
            });
        });

        return {
            code: 201,
            error: false,
            message: 'Order created successfully',
            data: createdOrder,
        };
    } catch (error) {
        return {
            code: 400,
            error: true,
            message: error instanceof Error ? error.message : 'Unable to create order',
        };
    }
}

export async function getAdminCommerceBootstrap(companyId: number) {
    const [settings, company, categories, products, pointsOfSale, rules, hours] = await Promise.all([
        ensureCommerceSettings(companyId),
        prisma.company.findUnique({
            where: { id: companyId },
            select: { currency: true },
        }),
        prisma.commerceCategory.findMany({
            where: { company_id: companyId, deleted_at: null },
            orderBy: { sort_order: 'asc' },
        }),
        prisma.commerceProduct.findMany({
            where: { company_id: companyId, deleted_at: null },
            orderBy: [{ is_featured: 'desc' }, { updated_at: 'desc' }],
            include: {
                images: {
                    orderBy: { sort_order: 'asc' },
                },
            },
        }),
        prisma.commercePointOfSale.findMany({
            where: { company_id: companyId },
            orderBy: [{ city: 'asc' }, { name: 'asc' }],
        }),
        prisma.commerceDeliveryAvailabilityRule.findMany({
            where: { company_id: companyId },
            orderBy: { weekday: 'asc' },
            include: {
                windows: {
                    orderBy: { sort_order: 'asc' },
                },
            },
        }),
        prisma.hours.findMany({
            where: { company_id: companyId },
            orderBy: [{ day_of_week: 'asc' }, { open_time: 'asc' }],
        }),
    ]);

    const deliveryRulesResolution = resolveDeliveryRulesWithHoursFallback(
        rules.map((rule) => ({
            id: rule.id,
            weekday: rule.weekday,
            delivery_enabled: rule.delivery_enabled,
            asap_enabled: rule.asap_enabled,
            scheduled_enabled: rule.scheduled_enabled,
            windows: rule.windows.map((window) => ({
                id: window.id,
                label: window.label,
                start_time: window.start_time,
                end_time: window.end_time,
                sort_order: window.sort_order,
            })),
        })),
        hours.map((hour) => ({
            day_of_week: hour.day_of_week,
            open_time: hour.open_time,
            close_time: hour.close_time,
            is_closed: hour.is_closed,
        })),
    );

    return {
        settings: {
            ...settings,
            currency: company?.currency ?? 'Bs.',
        },
        categories,
        products,
        points_of_sale: pointsOfSale.map((point) => ({
            ...point,
            osm_link: point.google_maps_link,
        })),
        delivery_rules: deliveryRulesResolution.rules,
        delivery_rules_source: deliveryRulesResolution.source,
    };
}

export async function updateCommerceSettings(companyId: number, input: UpdateCommerceSettingsInput) {
    const settings = await ensureCommerceSettings(companyId);
    const normalizedCurrency = input.currency === undefined ? undefined : normalizeCurrency(input.currency);

    const [updatedSettings, company] = await prisma.$transaction([
        prisma.commerceSettings.update({
            where: { id: settings.id },
            data: {
                supports_pickup: input.supports_pickup ?? undefined,
                supports_delivery: input.supports_delivery ?? undefined,
                qr_payment_enabled: input.qr_payment_enabled ?? undefined,
                qr_image_url: input.qr_image_url === undefined ? undefined : normalizeText(input.qr_image_url),
                support_phone: input.support_phone === undefined ? undefined : normalizeText(input.support_phone),
                asap_orders_enabled: input.asap_orders_enabled ?? undefined,
                scheduled_orders_enabled: input.scheduled_orders_enabled ?? undefined,
                hero_title: input.hero_title === undefined ? undefined : normalizeText(input.hero_title),
                hero_subtitle: input.hero_subtitle === undefined ? undefined : normalizeText(input.hero_subtitle),
                banner_image_url: input.banner_image_url === undefined ? undefined : normalizeText(input.banner_image_url),
            },
        }),
        prisma.company.update({
            where: { id: companyId },
            data: {
                currency: normalizedCurrency ?? undefined,
            },
            select: { currency: true },
        }),
    ]);

    if (input.banner_image_url !== undefined && input.banner_image_url !== settings.banner_image_url) {
        await deleteStoredImageIfOwned(companyId, settings.banner_image_url);
    }
    if (input.qr_image_url !== undefined && input.qr_image_url !== settings.qr_image_url) {
        await deleteStoredImageIfOwned(companyId, settings.qr_image_url);
    }

    return {
        ...updatedSettings,
        currency: company.currency,
    };
}

export async function listCommerceCategories(companyId: number) {
    return prisma.commerceCategory.findMany({
        where: { company_id: companyId, deleted_at: null },
        orderBy: { sort_order: 'asc' },
    });
}

export async function createCommerceCategory(companyId: number, input: CategoryInput) {
    const name = normalizeText(input.name);
    if (!name) {
        throw new Error('name is required');
    }

    const lastCategory = await prisma.commerceCategory.findFirst({
        where: { company_id: companyId, deleted_at: null },
        orderBy: [{ sort_order: 'desc' }, { id: 'desc' }],
        select: { sort_order: true },
    });

    return prisma.commerceCategory.create({
        data: {
            company_id: companyId,
            name,
            slug: slugify(name),
            sort_order: (lastCategory?.sort_order ?? -1) + 1,
            is_active: input.is_active ?? true,
        },
    });
}

export async function updateCommerceCategory(companyId: number, categoryId: number, input: CategoryInput) {
    const category = await prisma.commerceCategory.findFirst({
        where: { id: categoryId, company_id: companyId, deleted_at: null },
    });
    if (!category) throw new Error('Category not found');

    const name = normalizeText(input.name);

    return prisma.commerceCategory.update({
        where: { id: categoryId },
        data: {
            name: name ?? undefined,
            slug: name ? slugify(name) : undefined,
            is_active: input.is_active ?? undefined,
        },
    });
}

export async function moveCommerceCategory(
    companyId: number,
    categoryId: number,
    direction: 'up' | 'down',
) {
    const categories = await prisma.commerceCategory.findMany({
        where: { company_id: companyId, deleted_at: null },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        select: { id: true, sort_order: true },
    });

    const currentIndex = categories.findIndex((category) => category.id === categoryId);
    if (currentIndex < 0) {
        throw new Error('Category not found');
    }

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= categories.length) {
        return listCommerceCategories(companyId);
    }

    const current = categories[currentIndex];
    const adjacent = categories[swapIndex];

    await prisma.$transaction([
        prisma.commerceCategory.update({
            where: { id: current.id },
            data: { sort_order: adjacent.sort_order },
        }),
        prisma.commerceCategory.update({
            where: { id: adjacent.id },
            data: { sort_order: current.sort_order },
        }),
    ]);

    return listCommerceCategories(companyId);
}

export async function deleteCommerceCategory(companyId: number, categoryId: number) {
    const category = await prisma.commerceCategory.findFirst({
        where: { id: categoryId, company_id: companyId, deleted_at: null },
    });
    if (!category) throw new Error('Category not found');

    await prisma.commerceCategory.update({
        where: { id: categoryId },
        data: { deleted_at: new Date(), is_active: false },
    });
}

function normalizeImageArray(images?: string[] | null) {
    return (images || [])
        .map((image) => normalizeText(image))
        .filter((image): image is string => Boolean(image));
}

export async function listCommerceProducts(companyId: number) {
    return prisma.commerceProduct.findMany({
        where: { company_id: companyId, deleted_at: null },
        orderBy: [{ is_featured: 'desc' }, { updated_at: 'desc' }],
        include: {
            images: {
                orderBy: { sort_order: 'asc' },
            },
        },
    });
}

export async function createCommerceProduct(companyId: number, input: ProductInput) {
    const name = normalizeText(input.name);
    if (!name) throw new Error('name is required');
    if (!Number.isInteger(input.regular_price_cents) || input.regular_price_cents < 0) {
        throw new Error('regular_price_cents must be a non-negative integer');
    }
    if (!Number.isInteger(input.stock_quantity) || input.stock_quantity < 0) {
        throw new Error('stock_quantity must be a non-negative integer');
    }
    if (
        input.promotional_price_cents !== undefined
        && input.promotional_price_cents !== null
        && (!Number.isInteger(input.promotional_price_cents) || input.promotional_price_cents < 0)
    ) {
        throw new Error('promotional_price_cents must be a non-negative integer');
    }

    const imageUrls = normalizeImageArray(input.images);
    const promoSchedule = normalizePromoSchedule(input);
    if (
        promoSchedule.promotional_price_cents !== null
        && promoSchedule.promotional_price_cents > input.regular_price_cents
    ) {
        throw new Error('promotional_price_cents cannot be greater than regular_price_cents');
    }

    return prisma.$transaction(async (tx) => {
        const product = await tx.commerceProduct.create({
            data: {
                company_id: companyId,
                category_id: input.category_id ?? null,
                name,
                slug: slugify(name),
                description: normalizeText(input.description),
                regular_price_cents: input.regular_price_cents,
                promotional_price_cents: promoSchedule.promotional_price_cents,
                promo_valid_from: promoSchedule.promo_valid_from,
                promo_valid_until: promoSchedule.promo_valid_until,
                stock_quantity: input.stock_quantity,
                is_active: input.is_active ?? true,
                is_featured: input.is_featured ?? false,
                is_combo: input.is_combo ?? false,
            },
        });

        for (const [index, imageUrl] of imageUrls.entries()) {
            await tx.commerceProductImage.create({
                data: {
                    product_id: product.id,
                    image_url: imageUrl,
                    sort_order: index,
                },
            });
        }

        await tx.commerceStockMovement.create({
            data: {
                company_id: companyId,
                product_id: product.id,
                movement_type: CommerceStockMovementType.ADJUSTMENT,
                quantity: input.stock_quantity,
                reason: 'Initial stock',
            },
        });

        return tx.commerceProduct.findUnique({
            where: { id: product.id },
            include: {
                images: {
                    orderBy: { sort_order: 'asc' },
                },
            },
        });
    });
}

export async function updateCommerceProduct(companyId: number, productId: number, input: ProductInput) {
    const product = await prisma.commerceProduct.findFirst({
        where: { id: productId, company_id: companyId, deleted_at: null },
        include: {
            images: true,
        },
    });
    if (!product) throw new Error('Product not found');

    const imageUrls = normalizeImageArray(input.images);
    const promoSchedule = normalizePromoSchedule(input);
    if (
        promoSchedule.promotional_price_cents !== null
        && input.regular_price_cents !== undefined
        && promoSchedule.promotional_price_cents > input.regular_price_cents
    ) {
        throw new Error('promotional_price_cents cannot be greater than regular_price_cents');
    }

    return prisma.$transaction(async (tx) => {
        const updated = await tx.commerceProduct.update({
            where: { id: productId },
            data: {
                category_id: input.category_id === undefined ? undefined : input.category_id,
                name: normalizeText(input.name) ?? undefined,
                slug: input.name ? slugify(input.name) : undefined,
                description: input.description === undefined ? undefined : normalizeText(input.description),
                regular_price_cents: input.regular_price_cents ?? undefined,
                promotional_price_cents:
                    input.promotional_price_cents === undefined ? undefined : promoSchedule.promotional_price_cents,
                promo_valid_from:
                    input.promo_valid_from === undefined ? undefined : promoSchedule.promo_valid_from,
                promo_valid_until:
                    input.promo_valid_until === undefined ? undefined : promoSchedule.promo_valid_until,
                stock_quantity: input.stock_quantity ?? undefined,
                is_active: input.is_active ?? undefined,
                is_featured: input.is_featured ?? undefined,
                is_combo: input.is_combo ?? undefined,
            },
        });

        await tx.commerceProductImage.deleteMany({
            where: { product_id: productId },
        });

        for (const [index, imageUrl] of imageUrls.entries()) {
            await tx.commerceProductImage.create({
                data: {
                    product_id: productId,
                    image_url: imageUrl,
                    sort_order: index,
                },
            });
        }

        if (input.stock_quantity !== undefined && input.stock_quantity !== product.stock_quantity) {
            await tx.commerceStockMovement.create({
                data: {
                    company_id: companyId,
                    product_id: productId,
                    movement_type: CommerceStockMovementType.ADJUSTMENT,
                    quantity: Math.abs(input.stock_quantity - product.stock_quantity),
                    reason: 'Manual stock adjustment',
                },
            });
        }

        const refreshed = await tx.commerceProduct.findUnique({
            where: { id: updated.id },
            include: {
                images: {
                    orderBy: { sort_order: 'asc' },
                },
            },
        });

        const removedImages = product.images
            .map((image) => image.image_url)
            .filter((imageUrl) => !imageUrls.includes(imageUrl));
        for (const imageUrl of removedImages) {
            await deleteStoredImageIfOwned(companyId, imageUrl);
        }

        return refreshed;
    });
}

export async function deleteCommerceProduct(companyId: number, productId: number) {
    const product = await prisma.commerceProduct.findFirst({
        where: { id: productId, company_id: companyId, deleted_at: null },
        include: {
            images: true,
        },
    });
    if (!product) throw new Error('Product not found');

    await prisma.commerceProduct.update({
        where: { id: productId },
        data: {
            deleted_at: new Date(),
            is_active: false,
        },
    });

    for (const image of product.images) {
        await deleteStoredImageIfOwned(companyId, image.image_url);
    }
}

export async function listCommercePointsOfSale(companyId: number) {
    return prisma.commercePointOfSale.findMany({
        where: { company_id: companyId },
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
}

export async function createCommercePointOfSale(companyId: number, input: PointOfSaleInput) {
    const name = normalizeText(input.name);
    const city = normalizeText(input.city);
    if (!name || !city) {
        throw new Error('name and city are required');
    }

    return prisma.commercePointOfSale.create({
        data: {
            company_id: companyId,
            name,
            city,
            google_maps_link: normalizeOsmLink(input.osm_link),
            opening_hours_text: normalizeText(input.opening_hours_text),
            support_phone: normalizeText(input.support_phone),
            pickup_enabled: input.pickup_enabled ?? true,
            delivery_enabled: input.delivery_enabled ?? false,
            is_active: input.is_active ?? true,
        },
    });
}

export async function updateCommercePointOfSale(companyId: number, pointId: number, input: PointOfSaleInput) {
    const point = await prisma.commercePointOfSale.findFirst({
        where: { id: pointId, company_id: companyId },
    });
    if (!point) throw new Error('Point of sale not found');

    return prisma.commercePointOfSale.update({
        where: { id: pointId },
        data: {
            name: normalizeText(input.name) ?? undefined,
            city: normalizeText(input.city) ?? undefined,
            google_maps_link: input.osm_link === undefined ? undefined : normalizeOsmLink(input.osm_link),
            opening_hours_text:
                input.opening_hours_text === undefined ? undefined : normalizeText(input.opening_hours_text),
            support_phone: input.support_phone === undefined ? undefined : normalizeText(input.support_phone),
            pickup_enabled: input.pickup_enabled ?? undefined,
            delivery_enabled: input.delivery_enabled ?? undefined,
            is_active: input.is_active ?? undefined,
        },
    });
}

export async function deleteCommercePointOfSale(companyId: number, pointId: number) {
    const point = await prisma.commercePointOfSale.findFirst({
        where: { id: pointId, company_id: companyId },
    });
    if (!point) throw new Error('Point of sale not found');

    await prisma.commercePointOfSale.delete({
        where: { id: pointId },
    });
}

export async function getCommerceDeliveryRules(companyId: number) {
    const [rules, hours] = await Promise.all([
        prisma.commerceDeliveryAvailabilityRule.findMany({
            where: { company_id: companyId },
            orderBy: { weekday: 'asc' },
            include: {
                windows: {
                    orderBy: { sort_order: 'asc' },
                },
            },
        }),
        prisma.hours.findMany({
            where: { company_id: companyId },
            orderBy: [{ day_of_week: 'asc' }, { open_time: 'asc' }],
        }),
    ]);

    return resolveDeliveryRulesWithHoursFallback(
        rules.map((rule) => ({
            id: rule.id,
            weekday: rule.weekday,
            delivery_enabled: rule.delivery_enabled,
            asap_enabled: rule.asap_enabled,
            scheduled_enabled: rule.scheduled_enabled,
            windows: rule.windows.map((window) => ({
                id: window.id,
                label: window.label,
                start_time: window.start_time,
                end_time: window.end_time,
                sort_order: window.sort_order,
            })),
        })),
        hours.map((hour) => ({
            day_of_week: hour.day_of_week,
            open_time: hour.open_time,
            close_time: hour.close_time,
            is_closed: hour.is_closed,
        })),
    );
}

export async function upsertCommerceDeliveryRules(companyId: number, rules: DeliveryRuleInput[]) {
    for (const rule of rules) {
        if (!isValidWeekday(rule.weekday)) {
            throw new Error('weekday must be between 0 and 6');
        }
        for (const window of rule.windows || []) {
            if (!normalizeText(window.label)) {
                throw new Error('window label is required');
            }
            if (!isValidTimeLabel(window.start_time) || !isValidTimeLabel(window.end_time)) {
                throw new Error('window times must use HH:MM format');
            }
        }
    }

    await prisma.$transaction(async (tx) => {
        const existing = await tx.commerceDeliveryAvailabilityRule.findMany({
            where: { company_id: companyId },
            select: { id: true, weekday: true },
        });

        const existingByWeekday = new Map(existing.map((item) => [item.weekday, item.id]));

        for (const rule of rules) {
            const currentId = existingByWeekday.get(rule.weekday);
            const upserted = currentId
                ? await tx.commerceDeliveryAvailabilityRule.update({
                      where: { id: currentId },
                      data: {
                          delivery_enabled: rule.delivery_enabled,
                          asap_enabled: rule.asap_enabled,
                          scheduled_enabled: rule.scheduled_enabled,
                      },
                  })
                : await tx.commerceDeliveryAvailabilityRule.create({
                      data: {
                          company_id: companyId,
                          weekday: rule.weekday,
                          delivery_enabled: rule.delivery_enabled,
                          asap_enabled: rule.asap_enabled,
                          scheduled_enabled: rule.scheduled_enabled,
                      },
                  });

            await tx.commerceScheduleWindow.deleteMany({
                where: { rule_id: upserted.id },
            });

            for (const [index, window] of (rule.windows || []).entries()) {
                await tx.commerceScheduleWindow.create({
                    data: {
                        rule_id: upserted.id,
                        label: normalizeText(window.label)!,
                        start_time: normalizeText(window.start_time),
                        end_time: normalizeText(window.end_time),
                        sort_order: index,
                    },
                });
            }
        }

        const requestedWeekdays = new Set(rules.map((rule) => rule.weekday));
        const idsToDelete = existing
            .filter((item) => !requestedWeekdays.has(item.weekday))
            .map((item) => item.id);

        if (idsToDelete.length > 0) {
            await tx.commerceDeliveryAvailabilityRule.deleteMany({
                where: {
                    id: { in: idsToDelete },
                    company_id: companyId,
                },
            });
        }
    });

    return getCommerceDeliveryRules(companyId);
}

export async function listCommerceOrders(params: {
    companyId: number;
    status?: string | null;
    date?: string | null;
    point_of_sale_id?: number | null;
    fulfillment_type?: string | null;
    assigned_staff_id?: number | null;
    scope: OrderActorScope;
    userId?: string | null;
}) {
    let assignedStaffId = params.assigned_staff_id ?? null;
    if (params.scope === 'staff') {
        if (!params.userId) throw new Error('userId is required for staff scope');
        const staffProfile = await getStaffProfileForUser(params.companyId, params.userId);
        if (!staffProfile) throw new Error('Staff profile not found');
        assignedStaffId = staffProfile.id;
    }

    const date = parseDateOnly(params.date);

    return prisma.commerceOrder.findMany({
        where: {
            company_id: params.companyId,
            ...(params.status ? { status: params.status as CommerceOrderStatus } : {}),
            ...(assignedStaffId ? { assigned_staff_id: assignedStaffId } : {}),
            ...(params.point_of_sale_id ? { point_of_sale_id: params.point_of_sale_id } : {}),
            ...(params.fulfillment_type
                ? { fulfillment_type: params.fulfillment_type as CommerceFulfillmentType }
                : {}),
            ...(date
                ? {
                      created_at: {
                          gte: new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`),
                          lt: new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`),
                      },
                  }
                : {}),
        },
        orderBy: [{ created_at: 'desc' }],
        include: {
            point_of_sale: true,
            assigned_staff: {
                select: {
                    id: true,
                    display_name: true,
                },
            },
            customer_profile: {
                select: {
                    id: true,
                    user: {
                        select: {
                            email: true,
                            phoneNumber: true,
                            phone_prefix: true,
                        },
                    },
                },
            },
            items: true,
        },
    });
}

export async function listCustomerCommerceOrders(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            phoneNumber: true,
            phone_prefix: true,
        },
    });

    if (!user) {
        throw new Error('User not found');
    }

    const email = normalizeEmail(user.email);
    const phone = normalizePhone(user.phoneNumber);
    const phonePrefix = normalizePhonePrefix(user.phone_prefix);

    return prisma.commerceOrder.findMany({
        where: {
            OR: [
                {
                    customer_profile: {
                        is: {
                            user_id: userId,
                        },
                    },
                },
                ...(email ? [{ guest_email: email }] : []),
                ...(phone
                    ? [{
                        guest_phone: phone,
                        guest_phone_prefix: phonePrefix,
                    }]
                    : []),
            ],
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        include: {
            company: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    logo_url: true,
                    currency: true,
                },
            },
            point_of_sale: {
                select: {
                    id: true,
                    name: true,
                    city: true,
                },
            },
            items: {
                orderBy: { id: 'asc' },
                include: {
                    product: {
                        select: {
                            id: true,
                            images: {
                                orderBy: { sort_order: 'asc' },
                                take: 1,
                                select: {
                                    image_url: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
}

export async function getCommerceOrderDetail(params: {
    companyId: number;
    orderId: number;
    scope: OrderActorScope;
    userId?: string | null;
}) {
    let assignedStaffId: number | null = null;
    if (params.scope === 'staff') {
        if (!params.userId) throw new Error('userId is required for staff scope');
        const staffProfile = await getStaffProfileForUser(params.companyId, params.userId);
        if (!staffProfile) throw new Error('Staff profile not found');
        assignedStaffId = staffProfile.id;
    }

    return prisma.commerceOrder.findFirst({
        where: {
            id: params.orderId,
            company_id: params.companyId,
            ...(assignedStaffId ? { assigned_staff_id: assignedStaffId } : {}),
        },
        include: {
            items: {
                include: {
                    product: {
                        include: {
                            images: {
                                orderBy: { sort_order: 'asc' },
                            },
                        },
                    },
                },
            },
            assigned_staff: {
                select: {
                    id: true,
                    display_name: true,
                },
            },
            point_of_sale: true,
            customer_profile: {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phoneNumber: true,
                            phone_prefix: true,
                        },
                    },
                },
            },
        },
    });
}

export async function assignCommerceOrder(companyId: number, orderId: number, staffId: number) {
    const [order, staff] = await Promise.all([
        prisma.commerceOrder.findFirst({
            where: { id: orderId, company_id: companyId },
        }),
        prisma.staffProfile.findFirst({
            where: {
                id: staffId,
                company_id: companyId,
                deleted_at: null,
            },
            select: { id: true },
        }),
    ]);

    if (!order) throw new Error('Order not found');
    if (!staff) throw new Error('Staff member not found');

    return prisma.commerceOrder.update({
        where: { id: orderId },
        data: {
            assigned_staff_id: staffId,
            status:
                order.status === CommerceOrderStatus.NEW || order.status === CommerceOrderStatus.SCHEDULED
                    ? CommerceOrderStatus.ASSIGNED
                    : order.status,
        },
    });
}

export async function updateCommerceOrderStatus(params: {
    companyId: number;
    orderId: number;
    nextStatus: CommerceOrderStatus;
    scope: OrderActorScope;
    userId?: string | null;
    trackingLink?: string | null;
}) {
    let assignedStaffId: number | null = null;
    if (params.scope === 'staff') {
        if (!params.userId) throw new Error('userId is required for staff scope');
        const staffProfile = await getStaffProfileForUser(params.companyId, params.userId);
        if (!staffProfile) throw new Error('Staff profile not found');
        assignedStaffId = staffProfile.id;
    }

    const order = await prisma.commerceOrder.findFirst({
        where: {
            id: params.orderId,
            company_id: params.companyId,
            ...(assignedStaffId ? { assigned_staff_id: assignedStaffId } : {}),
        },
    });

    if (!order) throw new Error('Order not found');
    if (!isStatusTransitionAllowed(order.status, params.nextStatus, params.scope)) {
        throw new Error('Invalid status transition');
    }

    const updated = await prisma.$transaction(async (tx) => {
        const nextTrackingLink = normalizeText(params.trackingLink) ?? order.tracking_link;
        const record = await tx.commerceOrder.update({
            where: { id: order.id },
            data: {
                status: params.nextStatus,
                tracking_link: nextTrackingLink,
                cancelled_at: params.nextStatus === CommerceOrderStatus.CANCELLED ? new Date() : null,
            },
        });

        if (params.nextStatus === CommerceOrderStatus.CANCELLED && order.status !== CommerceOrderStatus.CANCELLED) {
            const items = await tx.commerceOrderItem.findMany({
                where: { order_id: order.id },
            });

            for (const item of items) {
                if (!item.product_id) continue;
                await tx.commerceProduct.update({
                    where: { id: item.product_id },
                    data: {
                        stock_quantity: {
                            increment: item.quantity,
                        },
                    },
                });
                await tx.commerceStockMovement.create({
                    data: {
                        company_id: params.companyId,
                        product_id: item.product_id,
                        order_id: order.id,
                        movement_type: CommerceStockMovementType.RESTORE,
                        quantity: item.quantity,
                        reason: 'Order cancelled',
                        created_by_id: params.userId ?? null,
                    },
                });
            }
        }

        return record;
    });

    if (updated.status === CommerceOrderStatus.SENT && updated.tracking_link) {
        await notifyTrackingIfPossible(updated.id);
    }

    return updated;
}

export async function setCommerceOrderTrackingLink(companyId: number, orderId: number, trackingLink: string) {
    const order = await prisma.commerceOrder.findFirst({
        where: {
            id: orderId,
            company_id: companyId,
        },
    });
    if (!order) throw new Error('Order not found');

    const updated = await prisma.commerceOrder.update({
        where: { id: orderId },
        data: {
            tracking_link: normalizeText(trackingLink),
        },
    });

    if (updated.status === CommerceOrderStatus.SENT && updated.tracking_link) {
        await notifyTrackingIfPossible(updated.id);
    }

    return updated;
}

export async function setCommerceOrderPaymentStatus(params: {
    companyId: number;
    orderId: number;
    nextPaymentStatus: PaymentStatus;
}) {
    const order = await prisma.commerceOrder.findFirst({
        where: {
            id: params.orderId,
            company_id: params.companyId,
        },
    });

    if (!order) throw new Error('Order not found');
    if (!isPaymentStatusTransitionAllowed(order.payment_status, params.nextPaymentStatus)) {
        throw new Error('Invalid payment status transition');
    }
    if (order.status === CommerceOrderStatus.CANCELLED && params.nextPaymentStatus === PaymentStatus.PAID) {
        throw new Error('Cancelled orders cannot be marked as paid');
    }

    return prisma.commerceOrder.update({
        where: { id: order.id },
        data: {
            payment_status: params.nextPaymentStatus,
        },
    });
}

export async function getCompanyStorePublicPayload(slug: string) {
    const storefront = await getCompanyStorefrontBySlug(slug);
    return buildStorefrontResponse(storefront);
}

export function getStoreFeatureKey() {
    return STORE_FEATURE;
}

export function getAllowedCommerceStatuses() {
    return ORDER_STATUS_SEQUENCE;
}
