import { Prisma, RestaurantReservationStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

export const blockingReservationStatuses: RestaurantReservationStatus[] = ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'];
export const reservationInclude = {
  table: { include: { dining_area: true } },
  customer_profile: { include: { user: { select: { id: true, name: true, email: true, phoneNumber: true } } } },
  created_by_user: { select: { id: true, name: true, email: true } },
  guests: { orderBy: { id: 'asc' } },
} satisfies Prisma.RestaurantReservationInclude;

export const restaurantReservationRepo = {
  find(companyId: number, id: number) {
    return prisma.restaurantReservation.findFirst({ where: { id, company_id: companyId }, include: reservationInclude });
  },
  findInTx(tx: Prisma.TransactionClient, companyId: number, id: number) {
    return tx.restaurantReservation.findFirst({ where: { id, company_id: companyId }, include: reservationInclude });
  },
  conflicts(tx: Prisma.TransactionClient, tableId: number, start: Date, end: Date, excludeId?: number) {
    /*
     * A Serializable transaction alone is not a sufficient reservation lock in
     * MySQL: two readers can otherwise both observe an empty interval. Lock the
     * selected table row and the indexed reservation interval before deciding it
     * is free. The second writer waits, then observes the first committed row.
     */
    return (async () => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM restaurant_table WHERE id = ${tableId} FOR UPDATE`);
      const rows = await tx.$queryRaw<Array<{ id: number; reservation_code: string }>>(Prisma.sql`
        SELECT id, reservation_code
        FROM restaurant_reservation
        WHERE table_id = ${tableId}
          AND status IN (${Prisma.join(blockingReservationStatuses)})
          AND start_time < ${end}
          AND end_time > ${start}
          ${excludeId ? Prisma.sql`AND id <> ${excludeId}` : Prisma.empty}
        FOR UPDATE
      `);
      return rows[0] ?? null;
    })();
  },
};
