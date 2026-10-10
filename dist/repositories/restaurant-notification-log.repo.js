"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restaurantNotificationLogRepo = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
exports.restaurantNotificationLogRepo = {
    list(companyId, reservationId) {
        return client_2.prisma.restaurantNotificationLog.findMany({
            where: { company_id: companyId, reservation_id: reservationId },
            orderBy: { created_at: 'desc' },
        });
    },
    hasAutomaticSend(companyId, reservationId, event, dedupKey) {
        return client_2.prisma.restaurantNotificationLog.findFirst({
            where: { company_id: companyId, reservation_id: reservationId, event, dedup_key: dedupKey, trigger: 'AUTOMATIC', status: 'SENT' },
            select: { id: true },
        });
    },
    async claimAutomatic(data) {
        try {
            return await client_2.prisma.restaurantNotificationLog.create({ data });
        }
        catch (error) {
            if (error?.code === 'P2002' && data.dedup_claim_key) {
                const existing = await client_2.prisma.restaurantNotificationLog.findFirst({ where: { company_id: data.company_id, dedup_claim_key: data.dedup_claim_key }, select: { id: true, status: true, updated_at: true } });
                if (!existing || existing.status === client_1.RestaurantNotificationStatus.SENT)
                    return null;
                // A crashed worker can leave a unique claim in PENDING. Reclaim only an
                // old claim (or an explicitly failed/skipped claim); concurrent callers
                // still observe the fresh PENDING row and cannot send twice.
                const stale = existing.status === client_1.RestaurantNotificationStatus.PENDING
                    ? existing.updated_at < new Date(Date.now() - 15 * 60 * 1000)
                    : existing.status === client_1.RestaurantNotificationStatus.FAILED || existing.status === client_1.RestaurantNotificationStatus.SKIPPED;
                if (!stale)
                    return null;
                const reclaimed = await client_2.prisma.restaurantNotificationLog.updateMany({
                    where: { id: existing.id, company_id: data.company_id, dedup_claim_key: data.dedup_claim_key, status: existing.status, ...(existing.status === client_1.RestaurantNotificationStatus.PENDING ? { updated_at: { lt: new Date(Date.now() - 15 * 60 * 1000) } } : {}) },
                    data: { status: client_1.RestaurantNotificationStatus.PENDING, recipient: data.recipient, provider_id: null, error_code: null, error_message: null, sent_at: null },
                });
                if (!reclaimed.count)
                    return null;
                return client_2.prisma.restaurantNotificationLog.findFirst({ where: { id: existing.id, company_id: data.company_id } });
            }
            if (error?.code === 'P2002')
                return null;
            throw error;
        }
    },
    async finalize(companyId, id, data) {
        const result = await client_2.prisma.restaurantNotificationLog.updateMany({ where: { id, company_id: companyId }, data });
        return result.count ? client_2.prisma.restaurantNotificationLog.findFirst({ where: { id, company_id: companyId } }) : null;
    },
    create(data) {
        return client_2.prisma.restaurantNotificationLog.create({ data });
    },
};
