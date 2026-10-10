"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminCommerceOrders = getAdminCommerceOrders;
exports.getAdminCommerceOrder = getAdminCommerceOrder;
exports.resolveAdminCommercePaymentProofFile = resolveAdminCommercePaymentProofFile;
exports.updateAdminCommerceOrderStatus = updateAdminCommerceOrderStatus;
exports.updateAdminCommerceOrderDeliveryCost = updateAdminCommerceOrderDeliveryCost;
exports.updateAdminCommerceOrderAssignment = updateAdminCommerceOrderAssignment;
exports.updateAdminCommerceOrderNotes = updateAdminCommerceOrderNotes;
exports.getAdminCommerceMetrics = getAdminCommerceMetrics;
exports.getAdminCommerceAssignableStaff = getAdminCommerceAssignableStaff;
exports.getPublicCommerceStore = getPublicCommerceStore;
exports.listPublicCommerceCategories = listPublicCommerceCategories;
exports.listPublicCommerceProducts = listPublicCommerceProducts;
exports.getPublicCommerceProduct = getPublicCommerceProduct;
exports.createPublicCommerceOrder = createPublicCommerceOrder;
exports.getPublicCommerceOrder = getPublicCommerceOrder;
exports.submitPublicCommercePaymentProof = submitPublicCommercePaymentProof;
exports.uploadCheckoutPaymentProof = uploadCheckoutPaymentProof;
exports.uploadPublicCommercePaymentProof = uploadPublicCommercePaymentProof;
exports.deletePublicCommercePaymentProof = deletePublicCommercePaymentProof;
exports.resolvePublicCommercePaymentProofFile = resolvePublicCommercePaymentProofFile;
exports.listMyCommerceOrders = listMyCommerceOrders;
exports.getMyCommerceOrder = getMyCommerceOrder;
exports.resolveMyCommercePaymentProofFile = resolveMyCommercePaymentProofFile;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const client_2 = require("../prisma/client");
const coordinates_1 = require("../utils/coordinates");
const CommerceRepo = __importStar(require("../repositories/commerce.repo"));
const commerce_combo_service_1 = require("./commerce-combo.service");
const commerce_inventory_service_1 = require("./commerce-inventory.service");
const commerce_pricing_service_1 = require("./commerce-pricing.service");
const commerce_notifications_service_1 = require("./commerce-notifications.service");
const phoneNormalization_1 = require("../utils/phoneNormalization");
const company_availability_1 = require("../utils/company-availability");
const storage_service_1 = require("./storage.service");
const storageDeleteToken_1 = require("../utils/storageDeleteToken");
const upload_intent_service_1 = require("./upload-intent.service");
const upload_errors_1 = require("../utils/upload-errors");
const upload_validation_1 = require("../utils/upload-validation");
const demo_operator_membership_service_1 = require("./demo-operator-membership.service");
const LEGACY_STORAGE_API_PREFIX = '/api/storage/';
function generateCommerceOrderPublicAccessToken() {
    return crypto_1.default.randomBytes(24).toString('base64url');
}
function buildCommercePaymentProofFileName(extension) {
    const version = `${Date.now()}-${crypto_1.default.randomBytes(12).toString('hex')}`;
    return `proof-${version}.${extension}`;
}
function buildCommercePaymentProofUserSegment(userId) {
    return Buffer.from(userId, 'utf8').toString('base64url');
}
function getCommercePaymentProofCheckoutPrefix(companyId, userId) {
    return `uploads/${companyId}/commerce-payment-proofs/customers/${buildCommercePaymentProofUserSegment(userId)}/`;
}
function getCommercePaymentProofOrderPrefix(companyId, orderId) {
    return `uploads/${companyId}/commerce-payment-proofs/orders/${orderId}/`;
}
function isInternalCommercePaymentProofPath(value) {
    return value.startsWith('uploads/') && value.includes('/commerce-payment-proofs/');
}
function isLegacyPublicStorageUrl(value) {
    return value.startsWith(LEGACY_STORAGE_API_PREFIX) || value.startsWith('http://') || value.startsWith('https://');
}
function normalizeEmail(email) {
    const value = (email ?? '').trim().toLowerCase();
    return value || null;
}
function escapeLike(value) {
    return value.replace(/[\\%_]/g, '\\$&');
}
function toDecimal(value) {
    if (value == null)
        return null;
    return value instanceof client_1.Prisma.Decimal ? value : new client_1.Prisma.Decimal(value);
}
function addDecimals(left, right) {
    return left.plus(right ?? new client_1.Prisma.Decimal(0));
}
function isOrderClosed(order) {
    return (order.payment_status === client_1.CommercePaymentStatus.CANCELLED ||
        order.payment_status === client_1.CommercePaymentStatus.REFUNDED ||
        order.fulfillment_status === client_1.CommerceFulfillmentStatus.CANCELLED ||
        order.fulfillment_status === client_1.CommerceFulfillmentStatus.REJECTED ||
        order.fulfillment_status === client_1.CommerceFulfillmentStatus.COMPLETED);
}
function isCancellationLikeStatus(params) {
    return (params.paymentStatus === client_1.CommercePaymentStatus.CANCELLED ||
        params.paymentStatus === client_1.CommercePaymentStatus.PAYMENT_REJECTED ||
        params.paymentStatus === client_1.CommercePaymentStatus.REFUNDED ||
        params.fulfillmentStatus === client_1.CommerceFulfillmentStatus.CANCELLED ||
        params.fulfillmentStatus === client_1.CommerceFulfillmentStatus.REJECTED);
}
const PAYMENT_STATUS_TRANSITIONS = {
    [client_1.CommercePaymentStatus.PENDING_REVIEW]: new Set([
        client_1.CommercePaymentStatus.PENDING_REVIEW,
        client_1.CommercePaymentStatus.AWAITING_DELIVERY_COST,
        client_1.CommercePaymentStatus.AWAITING_PAYMENT,
        client_1.CommercePaymentStatus.PAYMENT_SUBMITTED,
        client_1.CommercePaymentStatus.PAYMENT_CONFIRMED,
        client_1.CommercePaymentStatus.PAYMENT_REJECTED,
        client_1.CommercePaymentStatus.CANCELLED,
    ]),
    [client_1.CommercePaymentStatus.AWAITING_DELIVERY_COST]: new Set([
        client_1.CommercePaymentStatus.AWAITING_DELIVERY_COST,
        client_1.CommercePaymentStatus.AWAITING_PAYMENT,
        client_1.CommercePaymentStatus.CANCELLED,
    ]),
    [client_1.CommercePaymentStatus.AWAITING_PAYMENT]: new Set([
        client_1.CommercePaymentStatus.AWAITING_PAYMENT,
        client_1.CommercePaymentStatus.PAYMENT_SUBMITTED,
        client_1.CommercePaymentStatus.PAYMENT_CONFIRMED,
        client_1.CommercePaymentStatus.PAYMENT_REJECTED,
        client_1.CommercePaymentStatus.CANCELLED,
    ]),
    [client_1.CommercePaymentStatus.PAYMENT_SUBMITTED]: new Set([
        client_1.CommercePaymentStatus.PAYMENT_SUBMITTED,
        client_1.CommercePaymentStatus.PAYMENT_CONFIRMED,
        client_1.CommercePaymentStatus.PAYMENT_REJECTED,
        client_1.CommercePaymentStatus.CANCELLED,
    ]),
    [client_1.CommercePaymentStatus.PAYMENT_CONFIRMED]: new Set([
        client_1.CommercePaymentStatus.PAYMENT_CONFIRMED,
        client_1.CommercePaymentStatus.PAYMENT_REJECTED,
        client_1.CommercePaymentStatus.REFUNDED,
        client_1.CommercePaymentStatus.CANCELLED,
    ]),
    [client_1.CommercePaymentStatus.PAYMENT_REJECTED]: new Set([
        client_1.CommercePaymentStatus.PAYMENT_REJECTED,
        client_1.CommercePaymentStatus.PAYMENT_SUBMITTED,
        client_1.CommercePaymentStatus.PAYMENT_CONFIRMED,
        client_1.CommercePaymentStatus.CANCELLED,
    ]),
    [client_1.CommercePaymentStatus.REFUNDED]: new Set([client_1.CommercePaymentStatus.REFUNDED]),
    [client_1.CommercePaymentStatus.CANCELLED]: new Set([client_1.CommercePaymentStatus.CANCELLED]),
};
const FULFILLMENT_STATUS_TRANSITIONS = {
    [client_1.CommerceFulfillmentStatus.NEW]: new Set([
        client_1.CommerceFulfillmentStatus.NEW,
        client_1.CommerceFulfillmentStatus.ACCEPTED,
        client_1.CommerceFulfillmentStatus.PREPARING,
        client_1.CommerceFulfillmentStatus.REJECTED,
        client_1.CommerceFulfillmentStatus.CANCELLED,
    ]),
    [client_1.CommerceFulfillmentStatus.ACCEPTED]: new Set([
        client_1.CommerceFulfillmentStatus.ACCEPTED,
        client_1.CommerceFulfillmentStatus.PREPARING,
        client_1.CommerceFulfillmentStatus.READY_FOR_PICKUP,
        client_1.CommerceFulfillmentStatus.OUT_FOR_DELIVERY,
        client_1.CommerceFulfillmentStatus.REJECTED,
        client_1.CommerceFulfillmentStatus.CANCELLED,
    ]),
    [client_1.CommerceFulfillmentStatus.PREPARING]: new Set([
        client_1.CommerceFulfillmentStatus.PREPARING,
        client_1.CommerceFulfillmentStatus.READY_FOR_PICKUP,
        client_1.CommerceFulfillmentStatus.OUT_FOR_DELIVERY,
        client_1.CommerceFulfillmentStatus.REJECTED,
        client_1.CommerceFulfillmentStatus.CANCELLED,
    ]),
    [client_1.CommerceFulfillmentStatus.READY_FOR_PICKUP]: new Set([
        client_1.CommerceFulfillmentStatus.READY_FOR_PICKUP,
        client_1.CommerceFulfillmentStatus.COMPLETED,
        client_1.CommerceFulfillmentStatus.CANCELLED,
    ]),
    [client_1.CommerceFulfillmentStatus.OUT_FOR_DELIVERY]: new Set([
        client_1.CommerceFulfillmentStatus.OUT_FOR_DELIVERY,
        client_1.CommerceFulfillmentStatus.COMPLETED,
        client_1.CommerceFulfillmentStatus.CANCELLED,
    ]),
    [client_1.CommerceFulfillmentStatus.COMPLETED]: new Set([client_1.CommerceFulfillmentStatus.COMPLETED]),
    [client_1.CommerceFulfillmentStatus.REJECTED]: new Set([client_1.CommerceFulfillmentStatus.REJECTED]),
    [client_1.CommerceFulfillmentStatus.CANCELLED]: new Set([client_1.CommerceFulfillmentStatus.CANCELLED]),
};
function serializeCommerceStore(store) {
    return {
        ...store,
        fixed_delivery_cost: store.fixed_delivery_cost != null ? Number(store.fixed_delivery_cost) : null,
        order_schedule_slots: Array.isArray(store.order_schedule_slots)
            ? store.order_schedule_slots.map((slot) => ({
                ...slot,
            }))
            : [],
    };
}
function serializeCommercePointOfSale(pointOfSale) {
    const coordinates = (0, coordinates_1.getValidCoordinates)(pointOfSale.latitude, pointOfSale.longitude);
    return {
        ...pointOfSale,
        opening_time: pointOfSale.opening_time,
        closing_time: pointOfSale.closing_time,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
    };
}
function serializeCommerceProduct(product) {
    const effective = (0, commerce_pricing_service_1.resolveEffectiveCommercePrice)({
        price: product.price,
        regularPrice: product.regular_price,
        promoPrice: product.promo_price,
        promoStartsAt: product.promo_starts_at,
        promoEndsAt: product.promo_ends_at,
        promoLabel: product.promo_label,
    });
    const comboAvailableUnits = product.product_type === 'COMBO' && Array.isArray(product.combo_items) && product.combo_items.length > 0
        ? product.combo_items
            .filter((item) => item.component_product?.track_stock && !item.component_product?.allow_out_of_stock_orders)
            .reduce((min, item) => {
            const next = Math.floor((item.component_product.stock_quantity || 0) / item.quantity);
            return min == null ? next : Math.min(min, next);
        }, null)
        : null;
    return {
        ...product,
        price: Number(product.price),
        regular_price: product.regular_price != null ? Number(product.regular_price) : null,
        promo_price: product.promo_price != null ? Number(product.promo_price) : null,
        pricing: {
            regular_price: effective.regularPrice ? Number(effective.regularPrice) : null,
            base_price: Number(effective.basePrice),
            final_price: Number(effective.finalPrice),
            promo_applied: effective.promoApplied,
            promo_label: effective.promoLabel,
            promo_starts_at: effective.promoStartsAt,
            promo_ends_at: effective.promoEndsAt,
        },
        images: Array.isArray(product.images)
            ? product.images.map((image) => ({
                ...image,
            }))
            : [],
        combo_items: Array.isArray(product.combo_items)
            ? product.combo_items.map((item) => ({
                ...item,
                component_product: item.component_product
                    ? {
                        ...item.component_product,
                        price: item.component_product.price != null ? Number(item.component_product.price) : null,
                        regular_price: item.component_product.regular_price != null
                            ? Number(item.component_product.regular_price)
                            : null,
                        promo_price: item.component_product.promo_price != null
                            ? Number(item.component_product.promo_price)
                            : null,
                    }
                    : null,
            }))
            : [],
        combo_available_units: comboAvailableUnits,
    };
}
function buildAdminCommercePaymentProofUrl(orderId) {
    return `/api/admin/commerce/orders/${encodeURIComponent(orderId)}/payment-proof`;
}
function buildMyCommercePaymentProofUrl(companySlug, orderNumber) {
    return `/api/public/commerce/${encodeURIComponent(companySlug)}/me/orders/${encodeURIComponent(orderNumber)}/payment-proof/file`;
}
function buildPublicCommercePaymentProofUrl(companySlug, orderNumber, accessToken) {
    const params = new URLSearchParams({ token: accessToken });
    return `/api/public/commerce/${encodeURIComponent(companySlug)}/orders/${encodeURIComponent(orderNumber)}/payment-proof/file?${params.toString()}`;
}
function resolveSerializedCommercePaymentProofUrl(order, options) {
    const rawValue = typeof order.payment_proof_url === 'string' ? order.payment_proof_url.trim() : '';
    if (!rawValue)
        return null;
    if (isInternalCommercePaymentProofPath(rawValue)) {
        if (options?.paymentProofViewer === 'admin') {
            return buildAdminCommercePaymentProofUrl(order.id);
        }
        if (options?.paymentProofViewer === 'customer' && options.companySlug) {
            return buildMyCommercePaymentProofUrl(options.companySlug, order.order_number);
        }
        if (options?.paymentProofViewer === 'public' && options.companySlug && options.publicAccessToken) {
            return buildPublicCommercePaymentProofUrl(options.companySlug, order.order_number, options.publicAccessToken);
        }
        return null;
    }
    return isLegacyPublicStorageUrl(rawValue) ? rawValue : null;
}
function serializeCommerceOrder(order, options) {
    return {
        ...order,
        subtotal: order.subtotal != null ? Number(order.subtotal) : null,
        delivery_cost: order.delivery_cost != null ? Number(order.delivery_cost) : null,
        total: order.total != null ? Number(order.total) : null,
        public_access_token: options?.includePublicAccessToken ? order.public_access_token ?? null : undefined,
        payment_proof_url: resolveSerializedCommercePaymentProofUrl(order, {
            paymentProofViewer: options?.paymentProofViewer,
            companySlug: options?.companySlug,
            publicAccessToken: options?.publicAccessToken,
        }),
        items: Array.isArray(order.items)
            ? order.items.map((item) => ({
                ...item,
                unit_price_snapshot: item.unit_price_snapshot != null ? Number(item.unit_price_snapshot) : null,
                regular_price_snapshot: item.regular_price_snapshot != null ? Number(item.regular_price_snapshot) : null,
                total: item.total != null ? Number(item.total) : null,
                component_snapshots: item.component_snapshots ?? [],
            }))
            : [],
        status_history: options?.admin
            ? (order.status_history ?? []).map((entry) => ({
                ...entry,
            }))
            : undefined,
        internal_notes: options?.admin ? order.internal_notes : undefined,
        assigned_staff: options?.admin ? order.assigned_staff : undefined,
        customer_profile: options?.admin
            ? order.customer_profile
            : undefined,
    };
}
async function ensureCustomerCompanyRole(companyId, userId) {
    await (0, demo_operator_membership_service_1.assertDemoOperatorMayJoinCompany)(client_2.prisma, userId, companyId);
    const existing = await client_2.prisma.companyUser.findFirst({
        where: {
            company_id: companyId,
            user_id: userId,
            role: client_1.CompanyUserRole.CUSTOMER,
        },
        select: {
            id: true,
            deleted_at: true,
        },
    });
    if (!existing) {
        await client_2.prisma.companyUser.create({
            data: {
                company_id: companyId,
                user_id: userId,
                role: client_1.CompanyUserRole.CUSTOMER,
            },
        });
        return;
    }
    if (existing.deleted_at) {
        await client_2.prisma.companyUser.update({
            where: { id: existing.id },
            data: { deleted_at: null },
        });
    }
}
async function ensureCustomerProfile(companyId, userId) {
    const existing = await client_2.prisma.customerProfile.findFirst({
        where: {
            company_id: companyId,
            user_id: userId,
        },
        select: {
            id: true,
            deleted_at: true,
        },
    });
    if (!existing) {
        const created = await client_2.prisma.customerProfile.create({
            data: {
                company_id: companyId,
                user_id: userId,
            },
            select: { id: true },
        });
        return created.id;
    }
    if (existing.deleted_at) {
        await client_2.prisma.customerProfile.update({
            where: { id: existing.id },
            data: { deleted_at: null },
        });
    }
    return existing.id;
}
async function resolveAuthenticatedCommerceCustomer(params) {
    const [company, user] = await Promise.all([
        client_2.prisma.company.findUnique({
            where: { id: params.companyId },
            select: {
                phone_prefix: true,
            },
        }),
        client_2.prisma.user.findUnique({
            where: { id: params.userId },
            select: {
                id: true,
                deleted_at: true,
            },
        }),
    ]);
    if (!company) {
        throw new Error('No encontramos la empresa.');
    }
    if (!user || user.deleted_at) {
        throw new Error('Tu sesión ya no está disponible. Inicia sesión nuevamente.');
    }
    const customerName = params.customerName.trim();
    if (!customerName) {
        throw new Error('El nombre del cliente es obligatorio.');
    }
    const normalizedEmail = normalizeEmail(params.customerEmail);
    if (!normalizedEmail) {
        throw new Error('El correo del cliente es obligatorio.');
    }
    const canonicalPhone = (0, phoneNormalization_1.canonicalizePhoneParts)({
        phonePrefix: params.customerPhonePrefix,
        phoneNumber: params.customerPhone,
        defaultPrefix: company.phone_prefix || '591',
    });
    if (!canonicalPhone.phonePrefix) {
        throw new Error('El prefijo del cliente es obligatorio.');
    }
    if (!canonicalPhone.phoneNumber) {
        throw new Error('El teléfono del cliente es obligatorio.');
    }
    await ensureCustomerCompanyRole(params.companyId, params.userId);
    const customerProfileId = await ensureCustomerProfile(params.companyId, params.userId);
    return {
        customerProfileId,
        customerEmail: normalizedEmail,
        customerPhone: canonicalPhone.phoneNumber,
        customerPhonePrefix: canonicalPhone.phonePrefix,
    };
}
async function generateCommerceOrderNumber(tx, companyId) {
    // This is a transactional MySQL counter. INSERT ... ON DUPLICATE KEY
    // UPDATE serializes writers on the company row, including the first order
    // for a company whose sequence row was not present at migration time.
    await tx.$executeRaw `
        INSERT INTO \`commerce_order_sequence\`
            (\`company_id\`, \`next_order_number\`, \`created_at\`, \`updated_at\`)
        VALUES (${companyId}, 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE
            \`next_order_number\` = \`next_order_number\` + 1,
            \`updated_at\` = CURRENT_TIMESTAMP(3)
    `;
    const rows = await tx.$queryRaw `
        SELECT \`next_order_number\`
        FROM \`commerce_order_sequence\`
        WHERE \`company_id\` = ${companyId}
        FOR UPDATE
    `;
    const nextOrderNumber = Number(rows[0]?.next_order_number);
    const allocatedNumber = nextOrderNumber - 1;
    if (!Number.isSafeInteger(allocatedNumber) || allocatedNumber < 1) {
        throw new Error('No pudimos asignar un número de pedido válido.');
    }
    return `TDA-${String(allocatedNumber).padStart(6, '0')}`;
}
function isCommerceOrderNumberUniqueViolation(error) {
    const candidate = error;
    if (candidate?.code !== 'P2002')
        return false;
    const target = String(candidate.meta?.target ?? '').toLowerCase();
    const message = String(candidate.message ?? '').toLowerCase();
    return target.includes('order_number') || message.includes('commerce_order_company_order_number_key');
}
function parseTimeToMinutes(value) {
    const normalized = (value ?? '').trim();
    const match = normalized.match(/^(\d{2}):(\d{2})/);
    if (!match)
        return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes))
        return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59)
        return null;
    return hours * 60 + minutes;
}
function getTimeZoneParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'UTC',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const weekdayLabel = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    const weekdayMap = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };
    return {
        dayOfWeek: weekdayMap[weekdayLabel] ?? 0,
        minutes: hour * 60 + minute,
    };
}
function matchesScheduledMinute(params) {
    const zoned = getTimeZoneParts(params.scheduledFor, params.companyTimeZone);
    return params.slots.some((slot) => {
        if (slot.is_active === false)
            return false;
        if (slot.day_of_week !== zoned.dayOfWeek)
            return false;
        const startMinutes = parseTimeToMinutes(slot.start_time);
        const endMinutes = parseTimeToMinutes(slot.end_time);
        if (startMinutes == null || endMinutes == null || startMinutes >= endMinutes)
            return false;
        return zoned.minutes >= startMinutes && zoned.minutes < endMinutes;
    });
}
async function resolveStaffScopedCommerceAccess(params) {
    if (params.actorRole !== client_1.CompanyUserRole.STAFF) {
        return {};
    }
    if (!params.actorUserId) {
        return { code: 401, error: true, message: 'Unauthorized' };
    }
    const staffProfile = await client_2.prisma.staffProfile.findFirst({
        where: {
            company_id: params.companyId,
            user_id: params.actorUserId,
            deleted_at: null,
        },
        select: { id: true },
    });
    if (!staffProfile) {
        return {
            code: 403,
            error: true,
            message: 'No encontramos tu perfil de staff para esta empresa.',
        };
    }
    return {
        assignedStaffId: staffProfile.id,
    };
}
function validateScheduledOrder(params) {
    if (!params.scheduledFor)
        return null;
    if (!params.store.scheduled_orders_enabled) {
        return 'La tienda no tiene pedidos programados habilitados.';
    }
    const now = new Date();
    const minPreparationMinutes = Math.max(0, params.store.min_preparation_minutes ?? 0);
    const earliestAllowedAt = new Date(now.getTime() + minPreparationMinutes * 60 * 1000);
    if (params.scheduledFor <= earliestAllowedAt) {
        return 'La fecha programada debe ser futura.';
    }
    if (params.store.max_schedule_days_ahead != null) {
        const maxAt = new Date(now.getTime() + params.store.max_schedule_days_ahead * 24 * 60 * 60 * 1000);
        if (params.scheduledFor > maxAt) {
            return `La tienda solo acepta pedidos hasta ${params.store.max_schedule_days_ahead} día(s) por adelantado.`;
        }
    }
    const customSlots = params.store.order_slots_enabled && Array.isArray(params.store.order_schedule_slots)
        ? params.store.order_schedule_slots.filter((slot) => slot.is_active !== false)
        : [];
    if (customSlots.length > 0) {
        if (!matchesScheduledMinute({
            scheduledFor: params.scheduledFor,
            companyTimeZone: params.companyTimeZone,
            slots: customSlots,
        })) {
            return 'La fecha programada no coincide con las franjas habilitadas para pedidos.';
        }
        return null;
    }
    const fallbackBusinessHours = (params.businessHours ?? [])
        .filter((slot) => !slot.is_closed)
        .map((slot) => ({
        day_of_week: slot.day_of_week,
        start_time: slot.open_time,
        end_time: slot.close_time,
        is_active: true,
    }));
    if (fallbackBusinessHours.length > 0) {
        if (!matchesScheduledMinute({
            scheduledFor: params.scheduledFor,
            companyTimeZone: params.companyTimeZone,
            slots: fallbackBusinessHours,
        })) {
            return 'La fecha programada debe estar dentro del horario habilitado para pedidos.';
        }
    }
    return null;
}
function validateFulfillmentMode(params) {
    if (params.fulfillmentType === client_1.CommerceFulfillmentType.PICKUP &&
        params.store.fulfillment_mode === client_1.CommerceFulfillmentMode.DELIVERY_ONLY) {
        return 'Esta tienda solo acepta delivery.';
    }
    if (params.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY &&
        params.store.fulfillment_mode === client_1.CommerceFulfillmentMode.PICKUP_ONLY) {
        return 'Esta tienda solo acepta pedidos para recoger.';
    }
    return null;
}
function usesDeferredDeliveryCost(params) {
    return (params.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY &&
        params.deliveryCostMode === client_1.CommerceDeliveryCostMode.MANUAL);
}
function isProofBasedPaymentMethod(method) {
    return method === 'QR' || method === 'MANUAL';
}
function getCommercePaymentMethodLabel(method) {
    switch (method) {
        case 'CASH':
            return 'efectivo';
        case 'QR':
            return 'QR';
        case 'MANUAL':
            return 'transferencia manual';
        default:
            return method;
    }
}
function validateCommercePaymentMethod(params) {
    if (params.paymentMethod === 'CASH' && !params.store.allow_cash_payment) {
        return 'La tienda no acepta pagos en efectivo para este pedido.';
    }
    if (params.paymentMethod === 'QR' && !params.store.allow_qr_payment) {
        return 'La tienda no acepta pagos por QR para este pedido.';
    }
    if (params.paymentMethod === 'QR' && !params.store.qr_image_url?.trim()) {
        return 'La tienda no tiene un QR configurado para este pedido.';
    }
    if (params.paymentMethod === 'MANUAL' && !params.store.allow_manual_payment) {
        return 'La tienda no acepta pagos manuales para este pedido.';
    }
    return null;
}
function resolveInitialCommercePaymentStatus(params) {
    if (usesDeferredDeliveryCost({
        fulfillmentType: params.fulfillmentType,
        deliveryCostMode: params.deliveryCostMode,
    })) {
        return client_1.CommercePaymentStatus.AWAITING_DELIVERY_COST;
    }
    if (params.paymentMethod === 'CASH') {
        return client_1.CommercePaymentStatus.AWAITING_PAYMENT;
    }
    if (params.paymentProofUrl?.trim()) {
        return client_1.CommercePaymentStatus.PAYMENT_SUBMITTED;
    }
    return client_1.CommercePaymentStatus.AWAITING_PAYMENT;
}
async function appendOrderStatusHistory(params) {
    await params.tx.commerceOrderStatusHistory.create({
        data: {
            order_id: params.orderId,
            changed_by_user_id: params.changedByUserId ?? null,
            previous_payment_status: params.previousPaymentStatus ?? null,
            new_payment_status: params.newPaymentStatus ?? null,
            previous_fulfillment_status: params.previousFulfillmentStatus ?? null,
            new_fulfillment_status: params.newFulfillmentStatus ?? null,
            note: params.note?.trim() || null,
        },
    });
}
function extractCommercePaymentProofRelativePath(rawPathOrUrl, companyId) {
    const relativePath = storage_service_1.StorageService.toRelativeStoragePath(rawPathOrUrl);
    if (!relativePath)
        return null;
    if (!relativePath.startsWith(`uploads/${companyId}/commerce-payment-proofs/`)) {
        return null;
    }
    return relativePath;
}
async function ensureCommercePaymentProofExists(rawPathOrUrl, companyId) {
    const relativePath = extractCommercePaymentProofRelativePath(rawPathOrUrl, companyId);
    if (!relativePath)
        return null;
    const exists = await storage_service_1.StorageService.fileExists(relativePath);
    return exists ? relativePath : null;
}
async function uploadCommercePaymentProofFile(params) {
    const relativePath = await storage_service_1.StorageService.saveFile(params.companyId, 'commerce-payment-proofs', params.filename, params.file.buffer);
    return {
        relativePath,
        publicDeleteToken: (0, storageDeleteToken_1.buildStorageDeleteToken)(relativePath),
    };
}
function uploadServiceError(error) {
    if (error instanceof upload_errors_1.UploadSecurityError) {
        return { code: error.statusCode, error: true, errorCode: error.errorCode, reason: error.errorCode, message: error.message };
    }
    return { code: 400, error: true, message: 'No pudimos validar el comprobante.' };
}
function hasPublicOrderTokenAccess(order, accessToken) {
    if (!order.public_access_token || !accessToken)
        return false;
    return order.public_access_token === accessToken.trim();
}
function hasPublicOrderOwnerAccess(order, authUserId) {
    return Boolean(authUserId && order.customer_profile?.user_id && order.customer_profile.user_id === authUserId);
}
function canAccessPublicCommerceOrder(order, access) {
    return hasPublicOrderTokenAccess(order, access.accessToken) || hasPublicOrderOwnerAccess(order, access.authUserId);
}
async function getPublicCommerceOrderWithAccess(params) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(params.slug);
    if (!company) {
        return { error: true, result: { code: 404, error: true, message: 'No encontramos la tienda.' } };
    }
    const [store, order] = await Promise.all([
        CommerceRepo.findCommerceStoreByCompanyId(company.id),
        CommerceRepo.getPublicCommerceOrderByOrderNumber(company.id, params.orderNumber),
    ]);
    if (!store) {
        return { error: true, result: { code: 404, error: true, message: 'No encontramos la tienda.' } };
    }
    if (!order || !canAccessPublicCommerceOrder(order, params.access)) {
        return { error: true, result: { code: 404, error: true, message: 'No encontramos el pedido.' } };
    }
    return { error: false, company, store, order };
}
async function getAdminCommerceOrders(params) {
    const accessScope = await resolveStaffScopedCommerceAccess(params);
    if ('error' in accessScope && accessScope.error) {
        return accessScope;
    }
    const scope = accessScope;
    const orders = await CommerceRepo.listAdminCommerceOrders(params.companyId, scope);
    return {
        code: 200,
        error: false,
        message: 'Pedidos obtenidos correctamente.',
        data: orders.map((order) => serializeCommerceOrder(order, { admin: true, paymentProofViewer: 'admin' })),
    };
}
async function getAdminCommerceOrder(params) {
    const accessScope = await resolveStaffScopedCommerceAccess(params);
    if ('error' in accessScope && accessScope.error) {
        return accessScope;
    }
    const scope = accessScope;
    const order = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId, scope);
    if (!order) {
        return { code: 404, error: true, message: 'No encontramos el pedido.' };
    }
    return {
        code: 200,
        error: false,
        message: 'Pedido obtenido correctamente.',
        data: serializeCommerceOrder(order, { admin: true, paymentProofViewer: 'admin' }),
    };
}
async function resolveAdminCommercePaymentProofFile(params) {
    const accessScope = await resolveStaffScopedCommerceAccess(params);
    if ('error' in accessScope && accessScope.error) {
        return accessScope;
    }
    const scope = accessScope;
    const order = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId, scope);
    if (!order?.payment_proof_url) {
        return { code: 404, error: true, message: 'No encontramos el comprobante.' };
    }
    const relativePath = extractCommercePaymentProofRelativePath(order.payment_proof_url, params.companyId);
    if (!relativePath) {
        return { code: 404, error: true, message: 'No encontramos el comprobante.' };
    }
    return {
        code: 200,
        error: false,
        message: 'Comprobante obtenido correctamente.',
        data: { relativePath },
    };
}
async function updateAdminCommerceOrderStatus(params) {
    const accessScope = await resolveStaffScopedCommerceAccess(params);
    if ('error' in accessScope && accessScope.error) {
        return accessScope;
    }
    const scope = accessScope;
    const initialOrder = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId, scope);
    if (!initialOrder) {
        return { code: 404, error: true, message: 'No encontramos el pedido.' };
    }
    let transition;
    try {
        transition = await client_2.prisma.$transaction(async (tx) => {
            // Lock and re-read the order before deriving either next status or
            // inventory side effects. The request may have been built from a
            // stale browser view.
            await tx.$queryRaw `
                SELECT id
                FROM \`commerce_order\`
                WHERE \`id\` = ${params.orderId}
                  AND \`company_id\` = ${params.companyId}
                FOR UPDATE
            `;
            const order = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId, scope, tx);
            if (!order)
                return { kind: 'not_found' };
            const nextPaymentStatus = params.paymentStatus ?? order.payment_status;
            const nextFulfillmentStatus = params.fulfillmentStatus ?? order.fulfillment_status;
            const paymentChanged = nextPaymentStatus !== order.payment_status;
            const fulfillmentChanged = nextFulfillmentStatus !== order.fulfillment_status;
            const hasNote = Boolean(params.note?.trim());
            if (!paymentChanged && !fulfillmentChanged && !hasNote) {
                return {
                    kind: 'ok',
                    order,
                    idempotent: true,
                    paymentConfirmedTransition: false,
                    readyForPickupTransition: false,
                    outForDeliveryTransition: false,
                };
            }
            if (isOrderClosed(order) && (paymentChanged || fulfillmentChanged)) {
                return {
                    kind: 'error',
                    result: {
                        code: 409,
                        error: true,
                        errorCode: 'ORDER_STATE_CONFLICT',
                        reason: 'ORDER_STATE_CONFLICT',
                        message: 'El pedido ya está cerrado y no admite más cambios de estado.',
                    },
                };
            }
            if (!PAYMENT_STATUS_TRANSITIONS[order.payment_status].has(nextPaymentStatus)) {
                return {
                    kind: 'error',
                    result: {
                        code: 409,
                        error: true,
                        errorCode: 'ORDER_STATE_CONFLICT',
                        reason: 'ORDER_STATE_CONFLICT',
                        message: 'El estado de pago solicitado ya no es válido para este pedido.',
                    },
                };
            }
            if (!FULFILLMENT_STATUS_TRANSITIONS[order.fulfillment_status].has(nextFulfillmentStatus)) {
                return {
                    kind: 'error',
                    result: {
                        code: 409,
                        error: true,
                        errorCode: 'ORDER_STATE_CONFLICT',
                        reason: 'ORDER_STATE_CONFLICT',
                        message: 'El estado de preparación solicitado ya no es válido para este pedido.',
                    },
                };
            }
            if ((0, commerce_inventory_service_1.shouldDeductCommerceStock)({
                previousPaymentStatus: order.payment_status,
                newPaymentStatus: nextPaymentStatus,
            })) {
                await (0, commerce_inventory_service_1.deductCommerceOrderStock)(tx, order.id);
            }
            else if (order.stock_deducted_at &&
                isCancellationLikeStatus({
                    paymentStatus: nextPaymentStatus,
                    fulfillmentStatus: nextFulfillmentStatus,
                })) {
                await (0, commerce_inventory_service_1.restoreCommerceOrderStock)(tx, order.id);
            }
            await tx.commerceOrder.update({
                where: { id: order.id },
                data: {
                    payment_status: nextPaymentStatus,
                    fulfillment_status: nextFulfillmentStatus,
                    payment_confirmed_at: nextPaymentStatus === client_1.CommercePaymentStatus.PAYMENT_CONFIRMED
                        ? order.payment_confirmed_at ?? new Date()
                        : order.payment_confirmed_at,
                    accepted_at: nextFulfillmentStatus === client_1.CommerceFulfillmentStatus.ACCEPTED
                        ? order.accepted_at ?? new Date()
                        : order.accepted_at,
                    completed_at: nextFulfillmentStatus === client_1.CommerceFulfillmentStatus.COMPLETED
                        ? order.completed_at ?? new Date()
                        : order.completed_at,
                    cancelled_at: nextFulfillmentStatus === client_1.CommerceFulfillmentStatus.CANCELLED ||
                        nextFulfillmentStatus === client_1.CommerceFulfillmentStatus.REJECTED ||
                        nextPaymentStatus === client_1.CommercePaymentStatus.CANCELLED
                        ? order.cancelled_at ?? new Date()
                        : order.cancelled_at,
                },
            });
            await appendOrderStatusHistory({
                tx,
                orderId: order.id,
                changedByUserId: params.changedByUserId,
                previousPaymentStatus: order.payment_status,
                newPaymentStatus: nextPaymentStatus,
                previousFulfillmentStatus: order.fulfillment_status,
                newFulfillmentStatus: nextFulfillmentStatus,
                note: params.note,
            });
            const updated = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId, scope, tx);
            if (!updated)
                return { kind: 'not_found' };
            return {
                kind: 'ok',
                order: updated,
                idempotent: false,
                paymentConfirmedTransition: paymentChanged && nextPaymentStatus === client_1.CommercePaymentStatus.PAYMENT_CONFIRMED,
                readyForPickupTransition: fulfillmentChanged && nextFulfillmentStatus === client_1.CommerceFulfillmentStatus.READY_FOR_PICKUP,
                outForDeliveryTransition: fulfillmentChanged && nextFulfillmentStatus === client_1.CommerceFulfillmentStatus.OUT_FOR_DELIVERY,
            };
        });
    }
    catch (error) {
        if (error instanceof commerce_inventory_service_1.CommerceInsufficientStockError) {
            return {
                code: 409,
                error: true,
                errorCode: error.errorCode,
                reason: error.errorCode,
                message: error.message,
            };
        }
        if (error instanceof commerce_inventory_service_1.CommerceInventoryStateError) {
            return {
                code: 409,
                error: true,
                errorCode: error.errorCode,
                reason: error.errorCode,
                message: error.message,
            };
        }
        if (error?.code === 'P2034') {
            return {
                code: 409,
                error: true,
                errorCode: 'ORDER_STATE_CONFLICT',
                reason: 'ORDER_STATE_CONFLICT',
                message: 'El pedido cambió mientras lo actualizabas. Actualiza el detalle e inténtalo nuevamente.',
            };
        }
        throw error;
    }
    if (transition.kind === 'not_found') {
        return { code: 404, error: true, message: 'No encontramos el pedido.' };
    }
    if (transition.kind === 'error') {
        return transition.result;
    }
    if (transition.paymentConfirmedTransition) {
        void (0, commerce_notifications_service_1.notifyCommerceOrderCustomer)({
            companyId: params.companyId,
            orderId: transition.order.id,
            emailSubject: `Pago confirmado para tu pedido ${transition.order.order_number}`,
            message: `Confirmamos el pago de tu pedido ${transition.order.order_number}. Ya estamos avanzando con la preparación.`,
        });
    }
    else if (transition.readyForPickupTransition) {
        void (0, commerce_notifications_service_1.notifyCommerceOrderCustomer)({
            companyId: params.companyId,
            orderId: transition.order.id,
            emailSubject: `Tu pedido ${transition.order.order_number} está listo`,
            message: `Tu pedido ${transition.order.order_number} ya está listo para recoger.`,
        });
    }
    else if (transition.outForDeliveryTransition) {
        void (0, commerce_notifications_service_1.notifyCommerceOrderCustomer)({
            companyId: params.companyId,
            orderId: transition.order.id,
            emailSubject: `Tu pedido ${transition.order.order_number} va en camino`,
            message: `Tu pedido ${transition.order.order_number} salió para delivery.`,
        });
    }
    return {
        code: 200,
        error: false,
        message: transition.idempotent ? 'El pedido ya estaba en ese estado.' : 'Estado del pedido actualizado.',
        data: serializeCommerceOrder(transition.order, { admin: true, paymentProofViewer: 'admin' }),
    };
}
async function updateAdminCommerceOrderDeliveryCost(params) {
    const order = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId);
    if (!order) {
        return { code: 404, error: true, message: 'No encontramos el pedido.' };
    }
    if (order.fulfillment_type !== client_1.CommerceFulfillmentType.DELIVERY) {
        return { code: 400, error: true, message: 'Solo los pedidos con delivery pueden recibir este costo.' };
    }
    const store = await CommerceRepo.getOrCreateCommerceStore(params.companyId);
    if (store.delivery_cost_mode !== client_1.CommerceDeliveryCostMode.MANUAL) {
        return { code: 400, error: true, message: 'La tienda no usa costo manual de delivery.' };
    }
    const deliveryCost = new client_1.Prisma.Decimal(params.deliveryCost);
    const total = addDecimals(order.subtotal, deliveryCost);
    const updated = await client_2.prisma.$transaction(async (tx) => {
        const next = await tx.commerceOrder.update({
            where: { id: order.id },
            data: {
                delivery_cost: deliveryCost,
                total,
                payment_status: client_1.CommercePaymentStatus.AWAITING_PAYMENT,
            },
        });
        await appendOrderStatusHistory({
            tx,
            orderId: order.id,
            changedByUserId: params.changedByUserId,
            previousPaymentStatus: order.payment_status,
            newPaymentStatus: client_1.CommercePaymentStatus.AWAITING_PAYMENT,
            previousFulfillmentStatus: order.fulfillment_status,
            newFulfillmentStatus: order.fulfillment_status,
            note: params.note,
        });
        return tx.commerceOrder.findUniqueOrThrow({
            where: { id: next.id },
            include: {
                pickup_point: true,
                items: {
                    include: {
                        component_snapshots: true,
                    },
                },
                status_history: {
                    orderBy: [{ created_at: 'desc' }],
                },
            },
        });
    });
    void (0, commerce_notifications_service_1.notifyCommerceOrderCustomer)({
        companyId: params.companyId,
        orderId: order.id,
        emailSubject: `Costo de delivery confirmado para tu pedido ${order.order_number}`,
        message: order.payment_method === 'CASH'
            ? `Ya confirmamos el costo de delivery de tu pedido ${order.order_number}. Total: Bs ${Number(total).toFixed(2)}. El pago quedará pendiente para la entrega.`
            : order.payment_method === 'MANUAL'
                ? `Ya confirmamos el costo de delivery de tu pedido ${order.order_number}. Total: Bs ${Number(total).toFixed(2)}. Revisa las instrucciones de pago y comparte tu comprobante cuando lo tengas.`
                : `Ya confirmamos el costo de delivery de tu pedido ${order.order_number}. Total: Bs ${Number(total).toFixed(2)}. Ya podés pagar con QR y subir tu comprobante.`,
    });
    return {
        code: 200,
        error: false,
        message: 'Costo de delivery actualizado.',
        data: serializeCommerceOrder(updated, { admin: true, paymentProofViewer: 'admin' }),
    };
}
async function updateAdminCommerceOrderAssignment(params) {
    const order = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId);
    if (!order) {
        return { code: 404, error: true, message: 'No encontramos el pedido.' };
    }
    if (params.assignedStaffId) {
        const staff = await client_2.prisma.staffProfile.findFirst({
            where: {
                id: params.assignedStaffId,
                company_id: params.companyId,
                deleted_at: null,
            },
            select: { id: true },
        });
        if (!staff) {
            return { code: 404, error: true, message: 'No encontramos al personal seleccionado.' };
        }
    }
    const updated = await client_2.prisma.commerceOrder.update({
        where: { id: order.id },
        data: {
            assigned_staff_id: params.assignedStaffId ?? null,
        },
        include: {
            assigned_staff: {
                select: {
                    id: true,
                    display_name: true,
                    image_url: true,
                },
            },
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
            status_history: {
                orderBy: [{ created_at: 'desc' }],
            },
        },
    });
    if (params.note?.trim()) {
        await client_2.prisma.commerceOrderStatusHistory.create({
            data: {
                order_id: order.id,
                changed_by_user_id: params.changedByUserId ?? null,
                previous_payment_status: order.payment_status,
                new_payment_status: order.payment_status,
                previous_fulfillment_status: order.fulfillment_status,
                new_fulfillment_status: order.fulfillment_status,
                note: params.note.trim(),
            },
        });
    }
    return {
        code: 200,
        error: false,
        message: 'Asignación del pedido actualizada.',
        data: serializeCommerceOrder(updated, { admin: true, paymentProofViewer: 'admin' }),
    };
}
async function updateAdminCommerceOrderNotes(params) {
    const order = await CommerceRepo.getAdminCommerceOrder(params.companyId, params.orderId);
    if (!order) {
        return { code: 404, error: true, message: 'No encontramos el pedido.' };
    }
    const updated = await client_2.prisma.commerceOrder.update({
        where: { id: order.id },
        data: {
            internal_notes: params.internalNotes?.trim() || null,
        },
        include: {
            assigned_staff: {
                select: {
                    id: true,
                    display_name: true,
                    image_url: true,
                },
            },
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
            status_history: {
                orderBy: [{ created_at: 'desc' }],
            },
        },
    });
    return {
        code: 200,
        error: false,
        message: 'Notas internas actualizadas.',
        data: serializeCommerceOrder(updated, { admin: true, paymentProofViewer: 'admin' }),
    };
}
async function getAdminCommerceMetrics(companyId) {
    const metrics = await CommerceRepo.buildCommerceMetrics(companyId);
    return {
        code: 200,
        error: false,
        message: 'Métricas de tienda obtenidas correctamente.',
        data: metrics,
    };
}
async function getAdminCommerceAssignableStaff(companyId) {
    const staff = await CommerceRepo.listCompanyAssignableStaff(companyId);
    return {
        code: 200,
        error: false,
        message: 'Personal disponible obtenido correctamente.',
        data: staff,
    };
}
async function getPublicCommerceStore(slug) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    if (!(0, company_availability_1.isCompanyAvailableNow)({
        availableUntil: company.availableUntil,
        is_active: company.is_active,
        deleted_at: null,
    })) {
        return { code: 404, error: true, message: 'La tienda no está disponible en este momento.' };
    }
    const store = await CommerceRepo.findCommerceStoreByCompanyId(company.id);
    if (!store?.is_active) {
        return { code: 404, error: true, message: 'La tienda no está disponible en este momento.' };
    }
    const [categories, products, pickupPoints, pointsOfSale] = await Promise.all([
        CommerceRepo.listPublicCommerceCategories(company.id),
        CommerceRepo.listPublicCommerceProducts(company.id),
        client_2.prisma.commercePickupPoint.findMany({
            where: {
                company_id: company.id,
                is_active: true,
            },
            orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        }),
        CommerceRepo.listPublicCommercePointsOfSale(company.id),
    ]);
    const serializedProducts = products.map(serializeCommerceProduct);
    return {
        code: 200,
        error: false,
        message: 'Tienda pública obtenida correctamente.',
        data: {
            company: {
                id: company.id,
                slug: company.slug,
                name: company.name,
                currency: company.currency,
                country_code: company.country_code,
                timezone: company.timezone,
                logo_url: company.logo_url,
            },
            store: serializeCommerceStore(store),
            categories,
            pickup_points: pickupPoints,
            points_of_sale: pointsOfSale.map(serializeCommercePointOfSale),
            featured_products: serializedProducts.filter((product) => product.is_featured),
            promo_products: serializedProducts.filter((product) => product.pricing.promo_applied),
            combo_products: serializedProducts.filter((product) => product.product_type === 'COMBO'),
            products: serializedProducts,
        },
    };
}
async function listPublicCommerceCategories(slug) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    const store = await CommerceRepo.findCommerceStoreByCompanyId(company.id);
    if (!store?.is_active) {
        return { code: 404, error: true, message: 'La tienda no está disponible en este momento.' };
    }
    const categories = await CommerceRepo.listPublicCommerceCategories(company.id);
    return {
        code: 200,
        error: false,
        message: 'Categorías públicas obtenidas correctamente.',
        data: categories,
    };
}
async function listPublicCommerceProducts(slug) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    const store = await CommerceRepo.findCommerceStoreByCompanyId(company.id);
    if (!store?.is_active) {
        return { code: 404, error: true, message: 'La tienda no está disponible en este momento.' };
    }
    const products = await CommerceRepo.listPublicCommerceProducts(company.id);
    return {
        code: 200,
        error: false,
        message: 'Productos públicos obtenidos correctamente.',
        data: products.map(serializeCommerceProduct),
    };
}
async function getPublicCommerceProduct(slug, productSlug) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    const store = await CommerceRepo.findCommerceStoreByCompanyId(company.id);
    if (!store?.is_active) {
        return { code: 404, error: true, message: 'La tienda no está disponible en este momento.' };
    }
    const product = await CommerceRepo.getPublicCommerceProductBySlug(company.id, productSlug);
    if (!product) {
        return { code: 404, error: true, message: 'No encontramos el producto.' };
    }
    return {
        code: 200,
        error: false,
        message: 'Producto público obtenido correctamente.',
        data: serializeCommerceProduct(product),
    };
}
async function createPublicCommerceOrder(slug, input, authenticatedUserId) {
    if (!authenticatedUserId) {
        return { code: 401, error: true, message: 'Debes verificar tus datos e iniciar sesión antes de confirmar el pedido.' };
    }
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    const store = await CommerceRepo.findCommerceStoreByCompanyId(company.id);
    if (!store?.is_active) {
        return { code: 404, error: true, message: 'La tienda no está disponible en este momento.' };
    }
    const fulfillmentError = validateFulfillmentMode({
        fulfillmentType: input.fulfillmentType,
        store,
    });
    if (fulfillmentError) {
        return { code: 400, error: true, message: fulfillmentError };
    }
    const businessHours = await client_2.prisma.hours.findMany({
        where: {
            company_id: company.id,
        },
        select: {
            day_of_week: true,
            open_time: true,
            close_time: true,
            is_closed: true,
        },
    });
    const scheduleError = validateScheduledOrder({
        scheduledFor: input.scheduledFor,
        store,
        businessHours,
        companyTimeZone: company.timezone,
    });
    if (scheduleError) {
        return { code: 400, error: true, message: scheduleError };
    }
    const paymentMethodError = validateCommercePaymentMethod({
        store,
        paymentMethod: input.paymentMethod,
    });
    if (paymentMethodError) {
        return { code: 400, error: true, message: paymentMethodError };
    }
    if (input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY &&
        !input.deliveryAddress?.trim()) {
        return { code: 400, error: true, message: 'La dirección de delivery es obligatoria.' };
    }
    if (input.fulfillmentType === client_1.CommerceFulfillmentType.PICKUP) {
        const pickupPoints = await client_2.prisma.commercePickupPoint.findMany({
            where: {
                company_id: company.id,
                is_active: true,
            },
            select: {
                id: true,
            },
        });
        if (pickupPoints.length > 0 && !input.pickupPointId) {
            return { code: 400, error: true, message: 'Debes elegir un punto de retiro.' };
        }
        if (input.pickupPointId &&
            !pickupPoints.some((pickupPoint) => pickupPoint.id === input.pickupPointId)) {
            return { code: 404, error: true, message: 'No encontramos el punto de retiro.' };
        }
    }
    let paymentProofUrl = input.paymentProofUrl?.trim() || null;
    const totalKnownAtCheckout = !usesDeferredDeliveryCost({
        fulfillmentType: input.fulfillmentType,
        deliveryCostMode: store.delivery_cost_mode,
    });
    if (input.paymentMethod === 'CASH' && paymentProofUrl) {
        return {
            code: 400,
            error: true,
            message: 'Los pagos en efectivo no deben incluir comprobante.',
        };
    }
    if (totalKnownAtCheckout &&
        isProofBasedPaymentMethod(input.paymentMethod) &&
        store.payment_proof_required &&
        !paymentProofUrl) {
        return {
            code: 400,
            error: true,
            message: `Debes subir un comprobante para pagar con ${getCommercePaymentMethodLabel(input.paymentMethod)}.`,
        };
    }
    const products = await client_2.prisma.commerceProduct.findMany({
        where: {
            company_id: company.id,
            id: {
                in: input.items.map((item) => item.productId),
            },
            is_active: true,
        },
        include: {
            combo_items: {
                include: {
                    component_product: true,
                },
            },
            images: {
                orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
            },
            category: true,
        },
    });
    if (products.length !== input.items.length) {
        return { code: 400, error: true, message: 'Algunos productos ya no están disponibles.' };
    }
    const productById = new Map(products.map((product) => [product.id, product]));
    const itemRows = [];
    let subtotal = new client_1.Prisma.Decimal(0);
    for (const inputItem of input.items) {
        const product = productById.get(inputItem.productId);
        if (!product) {
            return { code: 404, error: true, message: 'No encontramos uno de los productos.' };
        }
        if (input.fulfillmentType === client_1.CommerceFulfillmentType.PICKUP &&
            !product.available_for_pickup) {
            return {
                code: 400,
                error: true,
                message: `${product.name} no está disponible para recoger.`,
            };
        }
        if (input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY &&
            !product.available_for_delivery) {
            return {
                code: 400,
                error: true,
                message: `${product.name} no está disponible para delivery.`,
            };
        }
        const pricing = (0, commerce_pricing_service_1.resolveEffectiveCommercePrice)({
            price: product.price,
            regularPrice: product.regular_price,
            promoPrice: product.promo_price,
            promoStartsAt: product.promo_starts_at,
            promoEndsAt: product.promo_ends_at,
            promoLabel: product.promo_label,
        });
        const unitPrice = pricing.finalPrice;
        const lineTotal = unitPrice.mul(inputItem.quantity);
        subtotal = subtotal.plus(lineTotal);
        itemRows.push({
            productId: product.id,
            quantity: inputItem.quantity,
            productNameSnapshot: product.name,
            productTypeSnapshot: product.product_type,
            unitPriceSnapshot: unitPrice,
            regularPriceSnapshot: pricing.regularPrice,
            promoAppliedSnapshot: pricing.promoApplied,
            promoLabelSnapshot: pricing.promoLabel,
            total: lineTotal,
            componentSnapshots: product.product_type === 'COMBO'
                ? (0, commerce_combo_service_1.buildCommerceComponentSnapshots)({
                    quantity: inputItem.quantity,
                    items: product.combo_items.map((item) => ({
                        quantity: item.quantity,
                        componentProduct: {
                            id: item.component_product.id,
                            name: item.component_product.name,
                        },
                    })),
                }).map((snapshot) => ({
                    component_product_id: snapshot.componentProductId,
                    component_name_snapshot: snapshot.componentNameSnapshot,
                    component_quantity_per_combo: snapshot.componentQuantityPerCombo,
                    total_component_quantity: snapshot.totalComponentQuantity,
                }))
                : [],
        });
    }
    const deliveryCost = input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY
        ? toDecimal(store.delivery_cost_mode === client_1.CommerceDeliveryCostMode.FIXED
            ? store.fixed_delivery_cost
            : null)
        : new client_1.Prisma.Decimal(0);
    const paymentStatus = resolveInitialCommercePaymentStatus({
        fulfillmentType: input.fulfillmentType,
        deliveryCostMode: store.delivery_cost_mode,
        paymentMethod: input.paymentMethod,
        paymentProofUrl,
    });
    const total = paymentStatus === client_1.CommercePaymentStatus.AWAITING_DELIVERY_COST
        ? null
        : addDecimals(subtotal, deliveryCost);
    const customer = await resolveAuthenticatedCommerceCustomer({
        companyId: company.id,
        userId: authenticatedUserId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerPhonePrefix: input.customerPhonePrefix,
        customerEmail: input.customerEmail,
    });
    if (paymentProofUrl) {
        try {
            const stored = await (0, upload_intent_service_1.assertStoredUpload)({
                rawPathOrUrl: paymentProofUrl,
                companyId: company.id,
                purpose: upload_intent_service_1.UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF,
                contextId: `CHECKOUT:${authenticatedUserId}`,
            });
            if (!stored.relativePath.startsWith(getCommercePaymentProofCheckoutPrefix(company.id, authenticatedUserId)) || !(await storage_service_1.StorageService.fileExists(stored.relativePath))) {
                return {
                    code: 403,
                    error: true,
                    message: 'No puedes adjuntar un comprobante que no te pertenece.',
                };
            }
            paymentProofUrl = stored.relativePath;
        }
        catch (error) {
            return uploadServiceError(error);
        }
    }
    let created;
    try {
        created = await client_2.prisma.$transaction(async (tx) => {
            const orderNumber = await generateCommerceOrderNumber(tx, company.id);
            const order = await tx.commerceOrder.create({
                data: {
                    company_id: company.id,
                    store_id: store.id,
                    customer_profile_id: customer.customerProfileId,
                    order_number: orderNumber,
                    public_access_token: generateCommerceOrderPublicAccessToken(),
                    customer_name: input.customerName.trim(),
                    customer_phone_prefix: customer.customerPhonePrefix,
                    customer_phone: customer.customerPhone,
                    customer_email: customer.customerEmail,
                    fulfillment_type: input.fulfillmentType,
                    pickup_point_id: input.fulfillmentType === client_1.CommerceFulfillmentType.PICKUP
                        ? input.pickupPointId ?? null
                        : null,
                    delivery_address: input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY
                        ? input.deliveryAddress?.trim() || null
                        : null,
                    delivery_notes: input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY
                        ? input.deliveryNotes?.trim() || null
                        : null,
                    delivery_latitude: input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY
                        ? input.deliveryLatitude ?? null
                        : null,
                    delivery_longitude: input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY
                        ? input.deliveryLongitude ?? null
                        : null,
                    delivery_place_id: input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY
                        ? input.deliveryPlaceId?.trim() || null
                        : null,
                    delivery_location_meta: input.fulfillmentType === client_1.CommerceFulfillmentType.DELIVERY
                        ? input.deliveryLocationMeta ?? client_1.Prisma.JsonNull
                        : client_1.Prisma.JsonNull,
                    scheduled_for: input.scheduledFor ?? null,
                    subtotal,
                    delivery_cost: deliveryCost,
                    total,
                    payment_method: input.paymentMethod,
                    payment_status: paymentStatus,
                    fulfillment_status: client_1.CommerceFulfillmentStatus.NEW,
                    payment_proof_url: isProofBasedPaymentMethod(input.paymentMethod) && paymentProofUrl
                        ? paymentProofUrl
                        : null,
                    customer_notes: input.customerNotes?.trim() || null,
                },
            });
            for (const row of itemRows) {
                const orderItem = await tx.commerceOrderItem.create({
                    data: {
                        order_id: order.id,
                        product_id: row.productId,
                        product_name_snapshot: row.productNameSnapshot,
                        product_type_snapshot: row.productTypeSnapshot,
                        unit_price_snapshot: row.unitPriceSnapshot,
                        regular_price_snapshot: row.regularPriceSnapshot,
                        promo_applied_snapshot: row.promoAppliedSnapshot,
                        promo_label_snapshot: row.promoLabelSnapshot,
                        quantity: row.quantity,
                        total: row.total,
                    },
                });
                if (row.componentSnapshots.length > 0) {
                    await tx.commerceOrderItemComponentSnapshot.createMany({
                        data: row.componentSnapshots.map((snapshot) => ({
                            order_item_id: orderItem.id,
                            component_product_id: snapshot.component_product_id,
                            component_name_snapshot: snapshot.component_name_snapshot,
                            component_quantity_per_combo: snapshot.component_quantity_per_combo,
                            total_component_quantity: snapshot.total_component_quantity,
                        })),
                    });
                }
            }
            await appendOrderStatusHistory({
                tx,
                orderId: order.id,
                previousPaymentStatus: null,
                newPaymentStatus: paymentStatus,
                previousFulfillmentStatus: null,
                newFulfillmentStatus: client_1.CommerceFulfillmentStatus.NEW,
                note: 'Pedido creado',
            });
            return tx.commerceOrder.findUniqueOrThrow({
                where: { id: order.id },
                include: {
                    pickup_point: true,
                    items: {
                        include: {
                            component_snapshots: true,
                        },
                    },
                },
            });
        });
    }
    catch (error) {
        if (isCommerceOrderNumberUniqueViolation(error)) {
            return {
                code: 409,
                error: true,
                errorCode: 'ORDER_NUMBER_CONFLICT',
                reason: 'ORDER_NUMBER_CONFLICT',
                message: 'No pudimos asignar un número de pedido. Intenta nuevamente.',
            };
        }
        if (error?.code === 'P2034') {
            return {
                code: 409,
                error: true,
                errorCode: 'ORDER_CREATE_CONFLICT',
                reason: 'ORDER_CREATE_CONFLICT',
                message: 'El pedido cambió mientras lo creábamos. Intenta nuevamente.',
            };
        }
        throw error;
    }
    void (0, commerce_notifications_service_1.notifyCommerceOrderCustomer)({
        companyId: company.id,
        orderId: created.id,
        emailSubject: `Recibimos tu pedido ${created.order_number}`,
        message: paymentStatus === client_1.CommercePaymentStatus.AWAITING_DELIVERY_COST
            ? `Recibimos tu pedido ${created.order_number}. Estamos revisando el costo de delivery y te vamos a avisar apenas esté listo.`
            : input.paymentMethod === 'CASH'
                ? `Recibimos tu pedido ${created.order_number}. El pago quedará pendiente para la entrega o el recojo.`
                : `Recibimos tu pedido ${created.order_number}. Ya podés revisar el detalle y completar el pago si todavía falta enviar tu comprobante.`,
    });
    return {
        code: 201,
        error: false,
        message: 'Pedido creado correctamente.',
        data: serializeCommerceOrder(created, {
            companySlug: company.slug,
            includePublicAccessToken: true,
            paymentProofViewer: 'customer',
        }),
    };
}
async function getPublicCommerceOrder(slug, orderNumber, access = {}) {
    const resolved = await getPublicCommerceOrderWithAccess({ slug, orderNumber, access });
    if (resolved.error) {
        return resolved.result;
    }
    const order = resolved.order;
    return {
        code: 200,
        error: false,
        message: 'Pedido público obtenido correctamente.',
        data: {
            company: {
                id: resolved.company.id,
                slug: resolved.company.slug,
                name: resolved.company.name,
                currency: resolved.company.currency,
                logo_url: resolved.company.logo_url,
            },
            store: {
                allow_cash_payment: resolved.store.allow_cash_payment,
                allow_qr_payment: resolved.store.allow_qr_payment,
                allow_manual_payment: resolved.store.allow_manual_payment,
                qr_image_url: resolved.store.qr_image_url,
                payment_instructions: resolved.store.payment_instructions,
                payment_proof_required: resolved.store.payment_proof_required,
                delivery_cost_mode: resolved.store.delivery_cost_mode,
                delivery_instructions: resolved.store.delivery_instructions,
            },
            order: serializeCommerceOrder(order, {
                companySlug: resolved.company.slug,
                paymentProofViewer: 'public',
                publicAccessToken: order.public_access_token ?? access.accessToken ?? null,
            }),
        },
    };
}
async function submitPublicCommercePaymentProof(slug, orderNumber, paymentProofUrl, access = {}) {
    const resolved = await getPublicCommerceOrderWithAccess({ slug, orderNumber, access });
    if (resolved.error) {
        return resolved.result;
    }
    const order = resolved.order;
    if (!isProofBasedPaymentMethod(order.payment_method)) {
        return {
            code: 400,
            error: true,
            message: 'Este pedido no usa un método de pago con comprobante.',
        };
    }
    if (order.payment_status !== client_1.CommercePaymentStatus.AWAITING_PAYMENT &&
        order.payment_status !== client_1.CommercePaymentStatus.PAYMENT_REJECTED) {
        return {
            code: 400,
            error: true,
            message: 'Este pedido no está esperando un comprobante de pago.',
        };
    }
    let relativePath;
    try {
        const stored = await (0, upload_intent_service_1.assertStoredUpload)({
            rawPathOrUrl: paymentProofUrl,
            companyId: resolved.company.id,
            purpose: upload_intent_service_1.UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF,
            contextId: `ORDER:${order.id}`,
        });
        if (!stored.relativePath.startsWith(getCommercePaymentProofOrderPrefix(resolved.company.id, order.id)) || !(await storage_service_1.StorageService.fileExists(stored.relativePath))) {
            return {
                code: 403,
                error: true,
                message: 'No puedes subir un comprobante para otro pedido.',
            };
        }
        relativePath = stored.relativePath;
    }
    catch (error) {
        return uploadServiceError(error);
    }
    const updated = await client_2.prisma.$transaction(async (tx) => {
        const next = await tx.commerceOrder.update({
            where: { id: order.id },
            data: {
                payment_proof_url: relativePath,
                payment_status: client_1.CommercePaymentStatus.PAYMENT_SUBMITTED,
            },
        });
        await appendOrderStatusHistory({
            tx,
            orderId: order.id,
            previousPaymentStatus: order.payment_status,
            newPaymentStatus: client_1.CommercePaymentStatus.PAYMENT_SUBMITTED,
            previousFulfillmentStatus: order.fulfillment_status,
            newFulfillmentStatus: order.fulfillment_status,
            note: 'Comprobante subido por el cliente',
        });
        return tx.commerceOrder.findUniqueOrThrow({
            where: { id: next.id },
            include: {
                pickup_point: true,
                items: {
                    include: {
                        component_snapshots: true,
                    },
                },
            },
        });
    });
    return {
        code: 200,
        error: false,
        message: 'Comprobante recibido correctamente.',
        data: serializeCommerceOrder(updated, {
            companySlug: resolved.company.slug,
            paymentProofViewer: hasPublicOrderTokenAccess(order, access.accessToken) ? 'public' : 'customer',
            publicAccessToken: order.public_access_token,
        }),
    };
}
async function uploadCheckoutPaymentProof(params) {
    if (!params.authUserId) {
        return { code: 401, error: true, message: 'Unauthorized' };
    }
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(params.slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    if (!params.uploadIntent)
        return uploadServiceError(new upload_errors_1.UploadSecurityError('UPLOAD_INTENT_INVALID'));
    if (!params.file)
        return uploadServiceError(new upload_errors_1.UploadSecurityError('UPLOAD_FILE_REQUIRED'));
    let validated;
    try {
        validated = (0, upload_validation_1.validateUploadFile)(params.file, { maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES });
    }
    catch (error) {
        return uploadServiceError(error);
    }
    let relativePath = null;
    let uploadRecorded = false;
    try {
        const intent = await (0, upload_intent_service_1.consumeUploadIntent)(params.uploadIntent, {
            expectedPurpose: upload_intent_service_1.UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF,
            companyId: company.id,
            contextId: `CHECKOUT:${params.authUserId}`,
        });
        relativePath = (await uploadCommercePaymentProofFile({
            companyId: company.id,
            filename: `customers/${buildCommercePaymentProofUserSegment(params.authUserId)}/${buildCommercePaymentProofFileName(validated.extension)}`,
            file: params.file,
        })).relativePath;
        await (0, upload_intent_service_1.recordStoredUpload)(intent, relativePath);
        uploadRecorded = true;
        return {
            code: 200,
            error: false,
            message: 'Comprobante subido correctamente.',
            data: { url: relativePath, deleteToken: (0, storageDeleteToken_1.buildStorageDeleteToken)(relativePath) },
        };
    }
    catch (error) {
        if (relativePath)
            await storage_service_1.StorageService.deleteFile(relativePath).catch(() => undefined);
        if (uploadRecorded)
            await client_2.prisma.uploadIntent.updateMany({ where: { stored_path: relativePath }, data: { stored_path: null } }).catch(() => undefined);
        return uploadServiceError(error);
    }
}
async function uploadPublicCommercePaymentProof(params) {
    const resolved = await getPublicCommerceOrderWithAccess({
        slug: params.slug,
        orderNumber: params.orderNumber,
        access: {
            accessToken: params.accessToken,
            authUserId: params.authUserId,
        },
    });
    if (resolved.error) {
        return resolved.result;
    }
    if (!params.uploadIntent)
        return uploadServiceError(new upload_errors_1.UploadSecurityError('UPLOAD_INTENT_INVALID'));
    if (!params.file)
        return uploadServiceError(new upload_errors_1.UploadSecurityError('UPLOAD_FILE_REQUIRED'));
    let validated;
    try {
        validated = (0, upload_validation_1.validateUploadFile)(params.file, { maxBytes: upload_validation_1.PUBLIC_UPLOAD_MAX_BYTES, allowedMimeTypes: upload_validation_1.PUBLIC_UPLOAD_MIME_TYPES });
    }
    catch (error) {
        return uploadServiceError(error);
    }
    let relativePath = null;
    let uploadRecorded = false;
    try {
        const intent = await (0, upload_intent_service_1.consumeUploadIntent)(params.uploadIntent, {
            expectedPurpose: upload_intent_service_1.UPLOAD_PURPOSES.ORDER_PAYMENT_PROOF,
            companyId: resolved.company.id,
            contextId: `ORDER:${resolved.order.id}`,
        });
        relativePath = (await uploadCommercePaymentProofFile({
            companyId: resolved.company.id,
            filename: `orders/${resolved.order.id}/${buildCommercePaymentProofFileName(validated.extension)}`,
            file: params.file,
        })).relativePath;
        await (0, upload_intent_service_1.recordStoredUpload)(intent, relativePath);
        uploadRecorded = true;
        return {
            code: 200,
            error: false,
            message: 'Comprobante subido correctamente.',
            data: { url: relativePath, deleteToken: (0, storageDeleteToken_1.buildStorageDeleteToken)(relativePath) },
        };
    }
    catch (error) {
        if (relativePath)
            await storage_service_1.StorageService.deleteFile(relativePath).catch(() => undefined);
        if (uploadRecorded)
            await client_2.prisma.uploadIntent.updateMany({ where: { stored_path: relativePath }, data: { stored_path: null } }).catch(() => undefined);
        return uploadServiceError(error);
    }
}
async function deletePublicCommercePaymentProof(params) {
    const resolved = await getPublicCommerceOrderWithAccess({
        slug: params.slug,
        orderNumber: params.orderNumber,
        access: {
            accessToken: params.accessToken,
            authUserId: params.authUserId,
        },
    });
    if (resolved.error) {
        return resolved.result;
    }
    const order = resolved.order;
    if (!order.payment_proof_url?.trim()) {
        return { code: 404, error: true, message: 'No encontramos un comprobante para este pedido.' };
    }
    const relativePath = extractCommercePaymentProofRelativePath(order.payment_proof_url, resolved.company.id);
    if (!relativePath) {
        return {
            code: 403,
            error: true,
            message: 'Este comprobante no se puede borrar desde este flujo.',
        };
    }
    if (!params.deleteToken || !(0, storageDeleteToken_1.verifyStorageDeleteToken)(params.deleteToken, relativePath)) {
        return uploadServiceError(new upload_errors_1.UploadSecurityError('UPLOAD_INTENT_INVALID', 403));
    }
    await client_2.prisma.commerceOrder.update({
        where: { id: order.id },
        data: {
            payment_proof_url: null,
            payment_status: client_1.CommercePaymentStatus.AWAITING_PAYMENT,
        },
    });
    await storage_service_1.StorageService.deleteFile(relativePath).catch(() => undefined);
    return {
        code: 200,
        error: false,
        message: 'Comprobante eliminado correctamente.',
    };
}
async function resolvePublicCommercePaymentProofFile(params) {
    const resolved = await getPublicCommerceOrderWithAccess({
        slug: params.slug,
        orderNumber: params.orderNumber,
        access: {
            accessToken: params.accessToken,
            authUserId: params.authUserId,
        },
    });
    if (resolved.error) {
        return resolved.result;
    }
    const relativePath = resolved.order?.payment_proof_url
        ? extractCommercePaymentProofRelativePath(resolved.order.payment_proof_url, resolved.company.id)
        : null;
    if (!relativePath) {
        return { code: 404, error: true, message: 'No encontramos el comprobante.' };
    }
    return {
        code: 200,
        error: false,
        message: 'Comprobante obtenido correctamente.',
        data: { relativePath },
    };
}
async function listMyCommerceOrders(slug, userId) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    const profiles = await client_2.prisma.customerProfile.findMany({
        where: { user_id: userId, company_id: company.id },
    });
    if (profiles.length === 0) {
        return {
            code: 200,
            error: false,
            message: 'Pedidos obtenidos correctamente.',
            data: [],
        };
    }
    const orders = await client_2.prisma.commerceOrder.findMany({
        where: {
            company_id: company.id,
            customer_profile_id: { in: profiles.map((p) => p.id) },
        },
        orderBy: { created_at: 'desc' },
        include: {
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
        },
    });
    return {
        code: 200,
        error: false,
        message: 'Pedidos obtenidos correctamente.',
        data: orders.map((order) => serializeCommerceOrder(order, {
            companySlug: company.slug,
            paymentProofViewer: 'customer',
        })),
    };
}
async function getMyCommerceOrder(slug, orderNumber, userId) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    const order = await client_2.prisma.commerceOrder.findFirst({
        where: {
            company_id: company.id,
            order_number: orderNumber,
            customer_profile: { user_id: userId },
        },
        include: {
            pickup_point: true,
            items: {
                include: {
                    component_snapshots: true,
                },
            },
            status_history: {
                orderBy: { created_at: 'desc' },
            },
        },
    });
    if (!order) {
        return { code: 404, error: true, message: 'No encontramos el pedido.' };
    }
    const store = await CommerceRepo.findCommerceStoreByCompanyId(company.id);
    return {
        code: 200,
        error: false,
        message: 'Pedido obtenido correctamente.',
        data: {
            company: {
                id: company.id,
                slug: company.slug,
                name: company.name,
                currency: company.currency,
                logo_url: company.logo_url,
            },
            store: store ? {
                allow_cash_payment: store.allow_cash_payment,
                allow_qr_payment: store.allow_qr_payment,
                allow_manual_payment: store.allow_manual_payment,
                qr_image_url: store.qr_image_url,
                payment_instructions: store.payment_instructions,
                payment_proof_required: store.payment_proof_required,
                delivery_cost_mode: store.delivery_cost_mode,
                delivery_instructions: store.delivery_instructions,
            } : null,
            order: serializeCommerceOrder(order, {
                companySlug: company.slug,
                paymentProofViewer: 'customer',
            }),
        },
    };
}
async function resolveMyCommercePaymentProofFile(params) {
    const company = await CommerceRepo.findActiveCommerceCompanyBySlug(params.slug);
    if (!company) {
        return { code: 404, error: true, message: 'No encontramos la tienda.' };
    }
    const order = await client_2.prisma.commerceOrder.findFirst({
        where: {
            company_id: company.id,
            order_number: params.orderNumber,
            customer_profile: { user_id: params.userId },
        },
        select: {
            id: true,
            payment_proof_url: true,
        },
    });
    if (!order?.payment_proof_url) {
        return { code: 404, error: true, message: 'No encontramos el comprobante.' };
    }
    const relativePath = extractCommercePaymentProofRelativePath(order.payment_proof_url, company.id);
    if (!relativePath) {
        return { code: 404, error: true, message: 'No encontramos el comprobante.' };
    }
    return {
        code: 200,
        error: false,
        message: 'Comprobante obtenido correctamente.',
        data: { relativePath },
    };
}
