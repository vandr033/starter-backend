"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = get;
exports.list = list;
exports.update = update;
exports.recalculate = recalculate;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const ok = (data, message = 'Operación realizada correctamente.', code = 200) => ({ code, error: false, message, data });
const fail = (code, message) => ({ code, error: true, message });
const profileInclude = { customer_profile: { include: { user: { select: { id: true, name: true, first_name: true, last_name: true, email: true, phoneNumber: true } } } }, preferred_dining_area: true, preferred_table: true, preferred_waiter: { select: { id: true, name: true, first_name: true, last_name: true, email: true } } };
function label(user) { return user ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.name || user.email : null; }
function safe(profile) { return profile ? { ...profile, preferred_waiter: profile.preferred_waiter ? { ...profile.preferred_waiter, label: label(profile.preferred_waiter) } : null, customer_profile: profile.customer_profile ? { ...profile.customer_profile, user: profile.customer_profile.user ? { ...profile.customer_profile.user, label: label(profile.customer_profile.user) } : null } : null } : null; }
async function ensure(companyId, customerProfileId, tx = client_2.prisma) {
    const customer = await tx.customerProfile.findFirst({ where: { id: customerProfileId, company_id: companyId, deleted_at: null } });
    if (!customer)
        throw Object.assign(new Error('El perfil de cliente no pertenece a la empresa.'), { status: 404 });
    const existing = await tx.restaurantCustomerProfile.findUnique({ where: { customer_profile_id: customerProfileId } });
    if (existing) {
        if (existing.company_id !== companyId)
            throw Object.assign(new Error('El perfil de hospitalidad no pertenece a la empresa activa.'), { status: 403 });
        return existing;
    }
    return tx.restaurantCustomerProfile.create({ data: { company_id: companyId, customer_profile_id: customerProfileId } });
}
async function get(companyId, customerProfileId) {
    try {
        const profile = await ensure(companyId, customerProfileId);
        const full = await client_2.prisma.restaurantCustomerProfile.findUnique({ where: { id: profile.id }, include: profileInclude });
        return full ? ok(safe(full)) : fail(404, 'No encontramos el perfil de hospitalidad.');
    }
    catch (error) {
        return fail(error?.status || 500, error?.message || 'No pudimos cargar el perfil.');
    }
}
async function list(companyId, query) {
    const where = { company_id: companyId, ...(query.vip === undefined ? {} : { vip: query.vip }), ...(query.search ? { customer_profile: { user: { OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }, { phoneNumber: { contains: query.search.replace(/\D/g, '') } }] } } } : {}) };
    const [total, items] = await client_2.prisma.$transaction([client_2.prisma.restaurantCustomerProfile.count({ where }), client_2.prisma.restaurantCustomerProfile.findMany({ where, include: profileInclude, orderBy: [{ vip: 'desc' }, { last_visit_at: 'desc' }, { updated_at: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit })]);
    return ok({ items: items.map(safe), pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
}
async function update(companyId, actorUserId, customerProfileId, input) {
    try {
        const profile = await client_2.prisma.$transaction(async (tx) => {
            const current = await ensure(companyId, customerProfileId, tx);
            const references = {};
            if (input.preferred_dining_area_id !== undefined) {
                if (input.preferred_dining_area_id !== null && !await tx.restaurantDiningArea.findFirst({ where: { id: input.preferred_dining_area_id, company_id: companyId } }))
                    throw Object.assign(new Error('El área preferida no pertenece a la empresa.'), { status: 400 });
                references.preferred_dining_area_id = input.preferred_dining_area_id;
            }
            if (input.preferred_table_id !== undefined) {
                if (input.preferred_table_id !== null && !await tx.restaurantTable.findFirst({ where: { id: input.preferred_table_id, company_id: companyId } }))
                    throw Object.assign(new Error('La mesa preferida no pertenece a la empresa.'), { status: 400 });
                references.preferred_table_id = input.preferred_table_id;
            }
            if (input.preferred_waiter_user_id !== undefined) {
                if (input.preferred_waiter_user_id !== null && !await tx.companyUser.findFirst({ where: { company_id: companyId, user_id: input.preferred_waiter_user_id, deleted_at: null } }))
                    throw Object.assign(new Error('El mozo preferido no pertenece a la empresa.'), { status: 400 });
                references.preferred_waiter_user_id = input.preferred_waiter_user_id;
            }
            const data = { vip: input.vip, vip_level: input.vip_level?.trim() || (input.vip_level === null ? null : undefined), birthday: input.birthday ? new Date(`${input.birthday}T00:00:00.000Z`) : input.birthday === null ? null : undefined, anniversary: input.anniversary ? new Date(`${input.anniversary}T00:00:00.000Z`) : input.anniversary === null ? null : undefined, seating_preference: input.seating_preference?.trim() || (input.seating_preference === null ? null : undefined), accessibility_requirements: input.accessibility_requirements?.trim() || (input.accessibility_requirements === null ? null : undefined), dietary_preferences: input.dietary_preferences?.trim() || (input.dietary_preferences === null ? null : undefined), allergies: input.allergies?.trim() || (input.allergies === null ? null : undefined), favorite_items: input.favorite_items, customer_facing_notes: input.customer_facing_notes?.trim() || (input.customer_facing_notes === null ? null : undefined), internal_hospitality_notes: input.internal_hospitality_notes?.trim() || (input.internal_hospitality_notes === null ? null : undefined), tags: input.tags, ...references };
            const updated = await tx.restaurantCustomerProfile.update({ where: { id: current.id }, data, include: profileInclude });
            await tx.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: actorUserId, event: 'CUSTOMER_HOSPITALITY_PROFILE_UPDATED', target_type: 'RESTAURANT_CUSTOMER_PROFILE', target_id: String(current.id), new_values: { vip: updated.vip, vip_level: updated.vip_level, preferred_dining_area_id: updated.preferred_dining_area_id, preferred_table_id: updated.preferred_table_id, preferred_waiter_user_id: updated.preferred_waiter_user_id } } });
            return updated;
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        return ok(safe(profile), 'Perfil de hospitalidad actualizado.');
    }
    catch (error) {
        return fail(error?.status || 500, error?.message || 'No pudimos actualizar el perfil.');
    }
}
async function recalculate(companyId, customerProfileId) {
    try {
        const updated = await client_2.prisma.$transaction(async (tx) => {
            const current = await ensure(companyId, customerProfileId, tx);
            const [reservations, visits] = await Promise.all([
                tx.restaurantReservation.findMany({ where: { company_id: companyId, customer_profile_id: customerProfileId }, select: { status: true, party_size: true, start_time: true } }),
                tx.restaurantVisit.findMany({ where: { company_id: companyId, reservation: { customer_profile_id: customerProfileId }, status: { in: ['CLOSED', 'REOPENED'] } }, select: { total_paid_amount_cents: true, guest_count: true, closed_at: true } }),
            ]);
            const completed = reservations.filter((reservation) => reservation.status === client_1.RestaurantReservationStatus.COMPLETED);
            const totalSpend = visits.reduce((sum, visit) => sum + visit.total_paid_amount_cents, 0);
            const averageParty = completed.length ? completed.reduce((sum, reservation) => sum + reservation.party_size, 0) / completed.length : 0;
            const profile = await tx.restaurantCustomerProfile.update({ where: { id: current.id }, data: { last_visit_at: visits.map((visit) => visit.closed_at).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null, visit_count: visits.length, no_show_count: reservations.filter((reservation) => reservation.status === client_1.RestaurantReservationStatus.NO_SHOW).length, cancellation_count: reservations.filter((reservation) => reservation.status === client_1.RestaurantReservationStatus.CANCELLED).length, total_spend_cents: totalSpend, average_spend_cents: visits.length ? Math.round(totalSpend / visits.length) : 0, average_party_size: averageParty } });
            return profile;
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        return ok(safe(await client_2.prisma.restaurantCustomerProfile.findUnique({ where: { id: updated.id }, include: profileInclude })), 'Perfil recalculado.');
    }
    catch (error) {
        return fail(error?.status || 500, error?.message || 'No pudimos recalcular el perfil.');
    }
}
