import { CommerceFulfillmentMode, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import * as CommerceRepo from '../repositories/commerce.repo';

type ServiceResult = {
    code: number;
    error: boolean;
    message: string;
    data?: any;
};

export async function getAdminCommerceStore(companyId: number): Promise<ServiceResult> {
    const store = await CommerceRepo.getOrCreateCommerceStore(companyId);
    const pickupPoints = await prisma.commercePickupPoint.findMany({
        where: { company_id: companyId },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    const orderScheduleSlots = await prisma.commerceOrderScheduleSlot.findMany({
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

export async function upsertAdminCommerceStore(
    companyId: number,
    input: {
        is_active?: boolean;
        fulfillment_mode?: CommerceFulfillmentMode;
        scheduled_orders_enabled?: boolean;
        min_preparation_minutes?: number | null;
        max_schedule_days_ahead?: number | null;
        order_slots_enabled?: boolean;
        allow_cash_payment?: boolean;
        allow_qr_payment?: boolean;
        allow_manual_payment?: boolean;
        qr_image_url?: string | null;
        payment_instructions?: string | null;
        payment_proof_required?: boolean;
        payment_review_required?: boolean;
        delivery_cost_mode?: 'MANUAL' | 'FIXED';
        fixed_delivery_cost?: number | null;
        delivery_instructions?: string | null;
        pickup_points?: Array<{
            id?: string;
            name: string;
            address?: string | null;
            map_url?: string | null;
            instructions?: string | null;
            is_active?: boolean;
            sort_order?: number;
        }>;
        order_schedule_slots?: Array<{
            id?: string;
            day_of_week: number;
            start_time: string;
            end_time: string;
            is_active?: boolean;
            sort_order?: number;
        }>;
    },
): Promise<ServiceResult> {
    const store = await CommerceRepo.getOrCreateCommerceStore(companyId);

    const updated = await prisma.$transaction(async (tx) => {
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
            const retainedIds = new Set<string>();
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
                } else {
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
            const retainedIds = new Set<string>();
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
                } else {
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
