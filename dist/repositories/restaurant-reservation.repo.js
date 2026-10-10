"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restaurantReservationRepo = exports.reservationInclude = exports.blockingReservationStatuses = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
exports.blockingReservationStatuses = ['PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED'];
exports.reservationInclude = {
    table: { include: { dining_area: true } },
    combination: { include: { tables: { include: { table: { include: { dining_area: true } } } } } },
    customer_profile: { include: { user: { select: { id: true, name: true, email: true, phoneNumber: true } } } },
    created_by_user: { select: { id: true, name: true, email: true } },
    guests: { orderBy: { id: 'asc' } },
};
exports.restaurantReservationRepo = {
    find(companyId, id) {
        return client_2.prisma.restaurantReservation.findFirst({ where: { id, company_id: companyId }, include: exports.reservationInclude });
    },
    findInTx(tx, companyId, id) {
        return tx.restaurantReservation.findFirst({ where: { id, company_id: companyId }, include: exports.reservationInclude });
    },
    conflicts(tx, tableId, start, end, excludeId) {
        /*
         * A Serializable transaction alone is not a sufficient reservation lock in
         * MySQL: two readers can otherwise both observe an empty interval. Lock the
         * selected table row and the indexed reservation interval before deciding it
         * is free. The second writer waits, then observes the first committed row.
         */
        return (async () => {
            await tx.$queryRaw(client_1.Prisma.sql `SELECT id FROM restaurant_table WHERE id = ${tableId} FOR UPDATE`);
            const rows = await tx.$queryRaw(client_1.Prisma.sql `
        SELECT DISTINCT rr.id, rr.reservation_code
        FROM restaurant_reservation rr
        WHERE rr.company_id = (SELECT company_id FROM restaurant_table WHERE id = ${tableId})
          AND rr.status IN (${client_1.Prisma.join(exports.blockingReservationStatuses)})
          AND rr.start_time < ${end}
          AND rr.end_time > ${start}
          AND (rr.table_id = ${tableId} OR EXISTS (SELECT 1 FROM restaurant_table_combination_table ct INNER JOIN restaurant_table_combination rc ON rc.id = ct.combination_id WHERE ct.company_id = (SELECT company_id FROM restaurant_table WHERE id = ${tableId}) AND rc.company_id = (SELECT company_id FROM restaurant_table WHERE id = ${tableId}) AND ct.combination_id = rr.combination_id AND ct.table_id = ${tableId}))
          ${excludeId ? client_1.Prisma.sql `AND rr.id <> ${excludeId}` : client_1.Prisma.empty}
        FOR UPDATE
      `);
            return rows[0] ?? null;
        })();
    },
};
