import { Prisma, RestaurantNotificationEvent } from '@prisma/client';
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
