import { Prisma, RestaurantNotificationEvent, RestaurantNotificationStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

export const restaurantNotificationLogRepo = {
  list(companyId: number, reservationId: number) {
    return prisma.restaurantNotificationLog.findMany({
      where: { company_id: companyId, reservation_id: reservationId },
      orderBy: { created_at: 'desc' },
    });
  },
  hasAutomaticSend(companyId: number, reservationId: number, event: RestaurantNotificationEvent, dedupKey: string) {
    return prisma.restaurantNotificationLog.findFirst({
      where: { company_id: companyId, reservation_id: reservationId, event, dedup_key: dedupKey, trigger: 'AUTOMATIC', status: 'SENT' },
      select: { id: true },
    });
  },
  async claimAutomatic(data: Prisma.RestaurantNotificationLogUncheckedCreateInput) {
    try {
      return await prisma.restaurantNotificationLog.create({ data });
    } catch (error: any) {
      if (error?.code === 'P2002' && data.dedup_claim_key) {
        const existing = await prisma.restaurantNotificationLog.findFirst({ where: { company_id: data.company_id, dedup_claim_key: data.dedup_claim_key }, select: { id: true, status: true, updated_at: true } });
        if (!existing || existing.status === RestaurantNotificationStatus.SENT) return null;
        // A crashed worker can leave a unique claim in PENDING. Reclaim only an
        // old claim (or an explicitly failed/skipped claim); concurrent callers
        // still observe the fresh PENDING row and cannot send twice.
        const stale = existing.status === RestaurantNotificationStatus.PENDING
          ? existing.updated_at < new Date(Date.now() - 15 * 60 * 1000)
          : existing.status === RestaurantNotificationStatus.FAILED || existing.status === RestaurantNotificationStatus.SKIPPED;
        if (!stale) return null;
        const reclaimed = await prisma.restaurantNotificationLog.updateMany({
          where: { id: existing.id, company_id: data.company_id, dedup_claim_key: data.dedup_claim_key, status: existing.status, ...(existing.status === RestaurantNotificationStatus.PENDING ? { updated_at: { lt: new Date(Date.now() - 15 * 60 * 1000) } } : {}) },
          data: { status: RestaurantNotificationStatus.PENDING, recipient: data.recipient, provider_id: null, error_code: null, error_message: null, sent_at: null },
        });
        if (!reclaimed.count) return null;
        return prisma.restaurantNotificationLog.findFirst({ where: { id: existing.id, company_id: data.company_id } });
      }
      if (error?.code === 'P2002') return null;
      throw error;
    }
  },
  async finalize(companyId: number, id: number, data: Prisma.RestaurantNotificationLogUncheckedUpdateInput) {
    const result = await prisma.restaurantNotificationLog.updateMany({ where: { id, company_id: companyId }, data });
    return result.count ? prisma.restaurantNotificationLog.findFirst({ where: { id, company_id: companyId } }) : null;
  },
  create(data: Prisma.RestaurantNotificationLogUncheckedCreateInput) {
    return prisma.restaurantNotificationLog.create({ data });
  },
};
