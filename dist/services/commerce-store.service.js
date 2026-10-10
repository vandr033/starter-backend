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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminCommerceStore = getAdminCommerceStore;
exports.upsertAdminCommerceStore = upsertAdminCommerceStore;
const client_1 = require("../prisma/client");
const CommerceRepo = __importStar(require("../repositories/commerce.repo"));
async function getAdminCommerceStore(companyId) {
    const store = await CommerceRepo.getOrCreateCommerceStore(companyId);
    const pickupPoints = await client_1.prisma.commercePickupPoint.findMany({
        where: { company_id: companyId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    const orderScheduleSlots = await client_1.prisma.commerceOrderScheduleSlot.findMany({
        where: { company_id: companyId },
        orderBy: [{ day_of_week: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
    });
    return {
        code: 200,
        error: false,
        message: 'Configuración de tienda obtenida correctamente.',
        data: {
            ...store,
            pickup_points: pickupPoints,
            order_schedule_slots: orderScheduleSlots,
        },
    };
}
async function upsertAdminCommerceStore(companyId, input) {
    const store = await CommerceRepo.getOrCreateCommerceStore(companyId);
    const updated = await client_1.prisma.$transaction(async (tx) => {
        const nextStore = await tx.commerceStore.update({
            where: { id: store.id },
            data: {
                is_active: input.is_active,
                fulfillment_mode: input.fulfillment_mode,
                scheduled_orders_enabled: input.scheduled_orders_enabled,
                min_preparation_minutes: input.min_preparation_minutes,
                max_schedule_days_ahead: input.max_schedule_days_ahead,
                order_slots_enabled: input.order_slots_enabled,
                allow_cash_payment: input.allow_cash_payment,
                allow_qr_payment: input.allow_qr_payment,
                allow_manual_payment: input.allow_manual_payment,
                qr_image_url: input.qr_image_url,
                payment_instructions: input.payment_instructions,
                payment_proof_required: input.payment_proof_required,
                payment_review_required: input.payment_review_required,
                delivery_cost_mode: input.delivery_cost_mode,
                fixed_delivery_cost: input.fixed_delivery_cost,
                delivery_instructions: input.delivery_instructions,
            },
        });
        if (input.pickup_points) {
            const retainedIds = new Set();
            for (const [index, point] of input.pickup_points.entries()) {
                if (point.id) {
                    retainedIds.add(point.id);
                    await tx.commercePickupPoint.updateMany({
                        where: {
                            id: point.id,
                            company_id: companyId,
                        },
                        data: {
                            name: point.name,
                            address: point.address ?? null,
                            map_url: point.map_url ?? null,
                            instructions: point.instructions ?? null,
                            is_active: point.is_active ?? true,
                            sort_order: point.sort_order ?? index,
                        },
                    });
                }
                else {
                    const created = await tx.commercePickupPoint.create({
                        data: {
                            company_id: companyId,
                            store_id: store.id,
                            name: point.name,
                            address: point.address ?? null,
                            map_url: point.map_url ?? null,
                            instructions: point.instructions ?? null,
                            is_active: point.is_active ?? true,
                            sort_order: point.sort_order ?? index,
                        },
                    });
                    retainedIds.add(created.id);
                }
            }
            await tx.commercePickupPoint.deleteMany({
                where: {
                    company_id: companyId,
                    ...(retainedIds.size > 0
                        ? {
                            id: {
                                notIn: Array.from(retainedIds),
                            },
                        }
                        : {}),
                },
            });
        }
        if (input.order_schedule_slots) {
            const retainedIds = new Set();
            for (const [index, slot] of input.order_schedule_slots.entries()) {
                if (slot.id) {
                    retainedIds.add(slot.id);
                    await tx.commerceOrderScheduleSlot.updateMany({
                        where: {
                            id: slot.id,
                            company_id: companyId,
                        },
                        data: {
                            day_of_week: slot.day_of_week,
                            start_time: slot.start_time,
                            end_time: slot.end_time,
                            is_active: slot.is_active ?? true,
                            sort_order: slot.sort_order ?? index,
                        },
                    });
                }
                else {
                    const created = await tx.commerceOrderScheduleSlot.create({
                        data: {
                            company_id: companyId,
                            store_id: store.id,
                            day_of_week: slot.day_of_week,
                            start_time: slot.start_time,
                            end_time: slot.end_time,
                            is_active: slot.is_active ?? true,
                            sort_order: slot.sort_order ?? index,
                        },
                    });
                    retainedIds.add(created.id);
                }
            }
            await tx.commerceOrderScheduleSlot.deleteMany({
                where: {
                    company_id: companyId,
                    ...(retainedIds.size > 0
                        ? {
                            id: {
                                notIn: Array.from(retainedIds),
                            },
                        }
                        : {}),
                },
            });
        }
        const pickupPoints = await tx.commercePickupPoint.findMany({
            where: { company_id: companyId },
            orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        });
        const orderScheduleSlots = await tx.commerceOrderScheduleSlot.findMany({
            where: { company_id: companyId },
            orderBy: [{ day_of_week: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }],
        });
        return {
            ...nextStore,
            pickup_points: pickupPoints,
            order_schedule_slots: orderScheduleSlots,
        };
    });
    return {
        code: 200,
        error: false,
        message: 'Configuración de tienda actualizada.',
        data: updated,
    };
}
