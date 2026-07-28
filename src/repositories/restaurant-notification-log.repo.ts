import { Prisma, RestaurantNotificationEvent } from '@prisma/client';
import { prisma } from '../prisma/client';

export const restaurantNotificationLogRepo = {
  list(companyId: number, reservationId: number) {
    return prisma.restaurantNotificationLog.findMany({
      where: { company_id: companyId, reservation_id: reservationId },
      orderBy: { created_at: 'desc' },
    });
  },
  hasAutomaticSend(reservationId: number, event: RestaurantNotificationEvent, dedupKey: string) {
    return prisma.restaurantNotificationLog.findFirst({
      where: { reservation_id: reservationId, event, dedup_key: dedupKey, trigger: 'AUTOMATIC', status: 'SENT' },
      select: { id: true },
    });
  },
  create(data: Prisma.RestaurantNotificationLogUncheckedCreateInput) {
    return prisma.restaurantNotificationLog.create({ data });
  },
};
