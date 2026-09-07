import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  CompanyUserRole,
  Prisma,
  RestaurantNotificationChannel,
  RestaurantNotificationEvent,
  RestaurantNotificationStatus,
  RestaurantNotificationTrigger,
  RestaurantReservationSource,
  RestaurantReservationStatus,
  RestaurantShiftMemberRole,
  RestaurantShiftStatus,
  RestaurantTableOperationalStatus,
  RestaurantVisitPaymentMethod,
  RestaurantVisitStatus,
} from '@prisma/client';
import { prisma } from '../src/prisma/client';
import { requireRestaurantCompanyContext } from '../src/middlewares/requireRestaurantCompanyContext';
import { requireRestaurantAccess } from '../src/middlewares/requireRestaurantAccess';
import { requirePlanFeature } from '../src/middlewares/requirePlanFeature';
import * as Closeouts from '../src/services/restaurant-closeout.service';
import * as Crm from '../src/services/restaurant-crm.service';
import * as Deposits from '../src/services/restaurant-deposit.service';
import * as Floor from '../src/services/restaurant-floor.service';
import * as Menu from '../src/services/restaurant-menu.service';
import { restaurantNotificationLogRepo } from '../src/repositories/restaurant-notification-log.repo';
import { listRestaurantNotificationHistory, notifyRestaurantReservation } from '../src/services/restaurant-notification.service';
import * as Reservations from '../src/services/restaurant-reservation.service';
import * as Restaurant from '../src/services/restaurant.service';
import * as ShiftService from '../src/services/restaurant-shift.service';
import * as StaffService from '../src/services/restaurant-staff.service';
import * as Visits from '../src/services/restaurant-visit.service';
import * as Waitlist from '../src/services/restaurant-waitlist.service';

/**
 * These tests intentionally require a real MySQL schema. They are skipped by
 * default so the normal unit/schema test command never implies DB coverage.
 * Run them against a disposable database with:
 * RUN_MYSQL_INTEGRATION=1 DATABASE_URL='mysql://...' node --test -r ts-node/register tests/restaurant-tenant-isolation.integration.test.ts
 */
const mysqlIntegrationEnabled = process.env.RUN_MYSQL_INTEGRATION === '1' && /^mysql(?:s)?:\/\//i.test(process.env.DATABASE_URL || '');
const skipReason = mysqlIntegrationEnabled ? false : 'RUN_MYSQL_INTEGRATION=1 and a mysql:// DATABASE_URL are required';

type ResourceSet = {
  areaId: number;
  tableId: number;
  secondTableId: number;
  combinationId: number;
  combinationSessionId: number;
  shiftId: number;
  waiterMemberId: number;
  reservationId: number;
  assignmentId: number;
  visitId: number;
  waitlistId: number;
  depositId: number;
  auditLogId: number;
  customerProfileId: number;
  crmProfileId: number;
  categoryId: number;
  itemId: number;
};

type Fixture = {
  companyA: { id: number; slug: string };
  companyB: { id: number; slug: string };
  expiredCompany: { id: number };
  disabledCompany: { id: number };
  noEntitlementCompany: { id: number };
  ownerA: string;
  adminA: string;
  waiterA: string;
  ownerB: string;
  waiterB: string;
  multi: string;
  resourcesA: ResourceSet;
  resourcesB: ResourceSet;
  userIds: string[];
  companyIds: number[];
  createdCompanyTypeId?: number;
};

let fixture: Fixture | null = null;

function responseRecorder() {
  let statusCode = 200;
  let payload: any = null;
  let continued = false;
  const response: any = {
    status(value: number) { statusCode = value; return response; },
    json(value: unknown) { payload = value; return value; },
  };
  return { response, get statusCode() { return statusCode; }, get payload() { return payload; }, get continued() { return continued; }, continue() { continued = true; } };
}

async function contextFor(userId: string, companyId: number, roles: CompanyUserRole[], cookieValue = String(companyId)) {
  const recorder = responseRecorder();
  const request: any = { authUser: { id: userId }, headers: { cookie: `active_company_id=${encodeURIComponent(cookieValue)}` } };
  await requireRestaurantCompanyContext(roles)(request, recorder.response, () => recorder.continue());
  return { ...recorder, request };
}

async function createUser(suffix: string) {
  return prisma.user.create({ data: { email: `restaurant-isolation-${suffix}-${Date.now()}@example.test`, name: suffix, first_name: suffix, is_active: true, emailVerified: true } });
}

async function createCompany(companyTypeId: number, suffix: string, options: { restaurantEnabled?: boolean; plan?: 'STARTER' | 'BUSINESS' | 'PRO'; availableUntil?: Date } = {}) {
  return prisma.company.create({ data: { slug: `restaurant-isolation-${suffix}-${Date.now()}`, name: `Isolation ${suffix}`, phone: '700000000', timezone: 'America/La_Paz', currency: 'Bs.', company_type_id: companyTypeId, restaurant_enabled: options.restaurantEnabled ?? true, plan: options.plan ?? 'PRO', availableUntil: options.availableUntil ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
}

async function createResources(companyId: number, ownerId: string, waiterId: string, suffix: string): Promise<ResourceSet> {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 60 * 1000);
  const end = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  await prisma.restaurantSettings.create({ data: { company_id: companyId, deposit_enabled: true, deposit_amount_cents: 2500, auto_confirm_reservations: true } });
  const area = await prisma.restaurantDiningArea.create({ data: { company_id: companyId, name: `Sala ${suffix}` } });
  const table = await prisma.restaurantTable.create({ data: { company_id: companyId, dining_area_id: area.id, name: `Mesa ${suffix}-1`, maximum_seats: 4 } });
  const secondTable = await prisma.restaurantTable.create({ data: { company_id: companyId, dining_area_id: area.id, name: `Mesa ${suffix}-2`, maximum_seats: 4 } });
  await prisma.restaurantTableOperationalState.createMany({ data: [table, secondTable].map((item) => ({ company_id: companyId, table_id: item.id, status: RestaurantTableOperationalStatus.AVAILABLE })) });
  const category = await prisma.restaurantMenuCategory.create({ data: { company_id: companyId, name: `Menú ${suffix}` } });
  const item = await prisma.restaurantMenuItem.create({ data: { company_id: companyId, category_id: category.id, name: `Plato ${suffix}`, price: new Prisma.Decimal('12.50') } });
  const shift = await prisma.restaurantShift.create({ data: { company_id: companyId, name: `Turno ${suffix}`, shift_date: start, start_at: start, end_at: end, timezone: 'America/La_Paz', status: RestaurantShiftStatus.OPEN, created_by_user_id: ownerId, opened_by_user_id: ownerId, opened_at: start } });
  const member = await prisma.restaurantShiftMember.create({ data: { company_id: companyId, shift_id: shift.id, user_id: waiterId, role: RestaurantShiftMemberRole.WAITER, created_by_user_id: ownerId } });
  const managerMember = await prisma.restaurantShiftMember.create({ data: { company_id: companyId, shift_id: shift.id, user_id: ownerId, role: RestaurantShiftMemberRole.MANAGER, created_by_user_id: ownerId } });
  await prisma.restaurantShiftDiningArea.create({ data: { company_id: companyId, shift_id: shift.id, dining_area_id: area.id } });
  await prisma.restaurantShiftTableAssignment.create({ data: { company_id: companyId, shift_id: shift.id, table_id: table.id, member_id: member.id, assigned_by_user_id: ownerId } });
  await prisma.restaurantShiftTableAssignment.create({ data: { company_id: companyId, shift_id: shift.id, table_id: secondTable.id, member_id: managerMember.id, assigned_by_user_id: ownerId } });
  const combination = await prisma.restaurantTableCombination.create({ data: { company_id: companyId, name: `Combinación ${suffix}`, dining_area_id: area.id, created_by_user_id: ownerId } });
  await prisma.restaurantTableCombinationTable.createMany({ data: [table, secondTable].map((item) => ({ company_id: companyId, combination_id: combination.id, table_id: item.id })) });
  const combinationSession = await prisma.restaurantTableCombinationSession.create({ data: { company_id: companyId, combination_id: combination.id, start_at: now, end_at: end, created_by_user_id: ownerId } });
  const reservation = await prisma.restaurantReservation.create({ data: { company_id: companyId, table_id: table.id, reservation_code: `IT-${suffix}-${Date.now()}`, reservation_date: now, start_time: new Date(now.getTime() + 30 * 60 * 1000), end_time: new Date(now.getTime() + 90 * 60 * 1000), party_size: 2, customer_name: `Guest ${suffix}`, customer_phone: '700000001', source: RestaurantReservationSource.ADMIN, status: RestaurantReservationStatus.CONFIRMED, created_by_user_id: ownerId } });
  const assignment = await prisma.restaurantReservationAssignment.create({ data: { company_id: companyId, reservation_id: reservation.id, table_id: table.id, assigned_by_user_id: ownerId } });
  const customer = await prisma.customerProfile.create({ data: { company_id: companyId, user_id: ownerId } });
  const crm = await prisma.restaurantCustomerProfile.create({ data: { company_id: companyId, customer_profile_id: customer.id, vip: true, allergies: 'fixture-only' } });
  const visit = await prisma.restaurantVisit.create({ data: { company_id: companyId, reservation_id: reservation.id, shift_id: shift.id, table_id: table.id, combination_session_id: combinationSession.id, primary_waiter_user_id: waiterId, primary_waiter_name: `Waiter ${suffix}`, dining_area_snapshot: area.name, table_name_snapshot: table.name, shift_name_snapshot: shift.name, guest_count: 2, subtotal_amount_cents: 3000, tip_amount_cents: 300, total_paid_amount_cents: 3300, currency: 'Bs.', payment_method: RestaurantVisitPaymentMethod.CASH, status: RestaurantVisitStatus.CLOSED, closed_by_user_id: ownerId, closed_at: now } });
  const waitlist = await prisma.restaurantWaitlist.create({ data: { company_id: companyId, guest_name: `Waiting ${suffix}`, party_size: 2, preferred_dining_area_id: area.id, created_by_user_id: ownerId } });
  await prisma.restaurantWaitlistEvent.create({ data: { company_id: companyId, waitlist_id: waitlist.id, event: 'ADDED', to_status: 'WAITING', actor_user_id: ownerId } });
  const deposit = await prisma.restaurantReservationDeposit.create({ data: { company_id: companyId, reservation_id: reservation.id, required_amount_cents: 2500, currency: 'Bs.', mode: 'PER_TABLE', status: 'PENDING', payment_deadline: new Date(now.getTime() + 60 * 60 * 1000) } });
  await prisma.restaurantInternalNote.create({ data: { company_id: companyId, author_user_id: waiterId, shift_id: shift.id, table_id: table.id, reservation_id: reservation.id, note: `Fixture note ${suffix}` } });
  const auditLog = await prisma.restaurantAuditLog.create({ data: { company_id: companyId, actor_user_id: ownerId, shift_id: shift.id, table_id: table.id, reservation_id: reservation.id, combination_id: combination.id, event: 'FIXTURE_CREATED', target_type: 'INTEGRATION_FIXTURE', target_id: suffix } });
  await prisma.restaurantNotificationLog.create({ data: { company_id: companyId, reservation_id: reservation.id, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CREATED, channel: RestaurantNotificationChannel.EMAIL, status: RestaurantNotificationStatus.PENDING, trigger: RestaurantNotificationTrigger.AUTOMATIC, dedup_key: `fixture-${suffix}`, dedup_claim_key: `fixture-claim-${suffix}-${Date.now()}` } });
  return { areaId: area.id, tableId: table.id, secondTableId: secondTable.id, combinationId: combination.id, combinationSessionId: combinationSession.id, shiftId: shift.id, waiterMemberId: member.id, reservationId: reservation.id, assignmentId: assignment.id, visitId: visit.id, waitlistId: waitlist.id, depositId: deposit.id, auditLogId: auditLog.id, customerProfileId: customer.id, crmProfileId: crm.id, categoryId: category.id, itemId: item.id };
}

async function buildFixture(): Promise<Fixture> {
  const existingType = await prisma.companyType.findFirst();
  const companyType = existingType || await prisma.companyType.create({ data: { key: `RESTAURANT_ISOLATION_${Date.now()}`, name: 'Restaurant isolation test' } });
  const ownerA = await createUser('owner-a');
  const adminA = await createUser('admin-a');
  const waiterA = await createUser('waiter-a');
  const ownerB = await createUser('owner-b');
  const waiterB = await createUser('waiter-b');
  const multi = await createUser('multi-company');
  const companyA = await createCompany(companyType.id, 'a');
  const companyB = await createCompany(companyType.id, 'b');
  const expiredCompany = await createCompany(companyType.id, 'expired', { availableUntil: new Date(Date.now() - 60 * 60 * 1000) });
  const disabledCompany = await createCompany(companyType.id, 'disabled', { restaurantEnabled: false });
  const noEntitlementCompany = await createCompany(companyType.id, 'starter', { plan: 'STARTER' });
  await prisma.companyUser.createMany({ data: [
    { company_id: companyA.id, user_id: ownerA.id, role: CompanyUserRole.OWNER },
    { company_id: companyA.id, user_id: adminA.id, role: CompanyUserRole.ADMIN },
    { company_id: companyA.id, user_id: waiterA.id, role: CompanyUserRole.STAFF },
    { company_id: companyA.id, user_id: multi.id, role: CompanyUserRole.ADMIN },
    { company_id: companyB.id, user_id: ownerB.id, role: CompanyUserRole.OWNER },
    { company_id: companyB.id, user_id: waiterB.id, role: CompanyUserRole.STAFF },
    { company_id: companyB.id, user_id: multi.id, role: CompanyUserRole.ADMIN },
    { company_id: expiredCompany.id, user_id: multi.id, role: CompanyUserRole.ADMIN },
    { company_id: disabledCompany.id, user_id: multi.id, role: CompanyUserRole.ADMIN },
    { company_id: noEntitlementCompany.id, user_id: multi.id, role: CompanyUserRole.ADMIN },
  ] });
  const resourcesA = await createResources(companyA.id, ownerA.id, waiterA.id, 'a');
  const resourcesB = await createResources(companyB.id, ownerB.id, waiterB.id, 'b');
  return { companyA, companyB, expiredCompany, disabledCompany, noEntitlementCompany, ownerA: ownerA.id, adminA: adminA.id, waiterA: waiterA.id, ownerB: ownerB.id, waiterB: waiterB.id, multi: multi.id, resourcesA, resourcesB, userIds: [ownerA.id, adminA.id, waiterA.id, ownerB.id, waiterB.id, multi.id], companyIds: [companyA.id, companyB.id, expiredCompany.id, disabledCompany.id, noEntitlementCompany.id], createdCompanyTypeId: existingType ? undefined : companyType.id };
}

async function cleanup(value: Fixture) {
  const companyIds = value.companyIds;
  await prisma.$transaction([
    prisma.restaurantShiftCloseoutAdjustment.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantShiftCloseout.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantAuditLog.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantInternalNote.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantNotificationLog.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantReservationDeposit.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantVisit.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantWaitlistEvent.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantWaitlist.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantReservationAssignment.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantTableCombinationSession.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantReservationGuest.deleteMany({ where: { reservation: { company_id: { in: companyIds } } } }),
    prisma.restaurantReservation.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantShiftTableAssignment.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantShiftDiningArea.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantShiftMember.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantShift.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantTableCombinationTable.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantTableCombination.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantCustomerProfile.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.customerProfile.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantTableOperationalState.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantMenuItem.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantMenuCategory.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantSettings.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantTable.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.restaurantDiningArea.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.companyUser.deleteMany({ where: { company_id: { in: companyIds } } }),
    prisma.company.deleteMany({ where: { id: { in: companyIds } } }),
  ]);
  await prisma.user.deleteMany({ where: { id: { in: value.userIds } } });
  if (value.createdCompanyTypeId) await prisma.companyType.deleteMany({ where: { id: value.createdCompanyTypeId } });
}

before(async () => {
  if (!mysqlIntegrationEnabled) return;
  await prisma.$connect();
  fixture = await buildFixture();
});

after(async () => {
  if (fixture) await cleanup(fixture);
  await prisma.$disconnect();
});

test('real MySQL strict context and active-company lifecycle', { skip: skipReason }, async () => {
  assert.ok(fixture);
  const selected = await contextFor(fixture.multi, fixture.companyB.id, [CompanyUserRole.ADMIN]);
  assert.equal(selected.continued, true);
  assert.equal(selected.request.companyID, fixture.companyB.id);

  const foreign = await contextFor(fixture.ownerA, fixture.companyB.id, [CompanyUserRole.OWNER, CompanyUserRole.ADMIN]);
  assert.equal(foreign.statusCode, 403);
  assert.equal(foreign.payload.reason, 'ACTIVE_COMPANY_NOT_MEMBER');

  const expired = await contextFor(fixture.multi, fixture.expiredCompany.id, [CompanyUserRole.ADMIN]);
  assert.equal(expired.statusCode, 403);
  assert.equal(expired.payload.reason, 'SHOP_EXPIRED');

  const invalid = await contextFor(fixture.multi, fixture.companyA.id, [CompanyUserRole.ADMIN], '../company-b');
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.reason, 'ACTIVE_COMPANY_INVALID');

  const disabledRequest = await contextFor(fixture.multi, fixture.disabledCompany.id, [CompanyUserRole.ADMIN]);
  assert.equal(disabledRequest.continued, true);
  const disabledResponse = responseRecorder();
  await requireRestaurantAccess(disabledRequest.request, disabledResponse.response, () => disabledResponse.continue());
  assert.equal(disabledResponse.statusCode, 403);
  assert.equal(disabledResponse.payload.reason, 'RESTAURANT_MODULE_DISABLED');

  const entitlementRequest = await contextFor(fixture.multi, fixture.noEntitlementCompany.id, [CompanyUserRole.ADMIN]);
  const entitlementResponse = responseRecorder();
  await requirePlanFeature('RESTAURANT_MODULE')(entitlementRequest.request, entitlementResponse.response, () => entitlementResponse.continue());
  assert.equal(entitlementResponse.statusCode, 403);
  assert.equal(entitlementResponse.payload.reason, 'FEATURE_NOT_ENTITLED');
  assert.equal(entitlementResponse.payload.errorCode, 'FEATURE_NOT_ENTITLED');
});

test('real MySQL tenant-scoped reads and mutations reject Company B resources', { skip: skipReason }, async () => {
  assert.ok(fixture);
  const b = fixture.resourcesB;
  const waiterAdminContext = await contextFor(fixture.waiterA, fixture.companyA.id, [CompanyUserRole.OWNER, CompanyUserRole.ADMIN]);
  assert.equal(waiterAdminContext.statusCode, 403);
  assert.equal(waiterAdminContext.payload.reason, 'INSUFFICIENT_COMPANY_ROLE');
  const switchedToA = await contextFor(fixture.multi, fixture.companyA.id, [CompanyUserRole.ADMIN]);
  const switchedToB = await contextFor(fixture.multi, fixture.companyB.id, [CompanyUserRole.ADMIN]);
  assert.equal(switchedToA.request.companyID, fixture.companyA.id);
  assert.equal(switchedToB.request.companyID, fixture.companyB.id);

  assert.equal((await Reservations.getReservation(fixture.companyA.id, b.reservationId)).code, 404);
  assert.equal((await Reservations.updateReservation(fixture.companyA.id, b.reservationId, { notes: 'should-not-change' })).code, 404);
  assert.equal((await Restaurant.updateTable(fixture.companyA.id, b.tableId, { name: 'should-not-change' })).error, true);
  assert.equal((await Restaurant.updateArea(fixture.companyA.id, b.areaId, { name: 'should-not-change' })).code, 404);
  assert.equal((await ShiftService.getShift(fixture.companyA.id, b.shiftId)).code, 404);
  assert.equal((await ShiftService.updateShift(fixture.companyA.id, b.shiftId, fixture.ownerA, { name: 'should-not-change' })).code, 404);
  assert.equal((await ShiftService.replaceAssignments(fixture.companyA.id, b.shiftId, fixture.ownerA, [])).code, 404);
  assert.equal((await Floor.deleteCombination(fixture.companyA.id, b.combinationId, fixture.ownerA)).code, 404);
  assert.equal((await Floor.releaseCombinationSession(fixture.companyA.id, b.combinationSessionId, fixture.ownerA)).code, 404);
  assert.equal((await StaffService.addInternalNote(fixture.companyA.id, fixture.waiterA, { table_id: b.tableId, note: 'should-not-change' })).error, true);
  assert.equal((await Menu.getItem(fixture.companyA.id, b.itemId)).error, true);
  assert.equal((await Menu.updateItem(fixture.companyA.id, b.itemId, { name: 'should-not-change' })).code, 404);
  assert.equal((await Visits.getVisit(fixture.companyA.id, b.visitId)).code, 404);
  assert.equal((await Deposits.getDeposit(fixture.companyA.id, b.depositId)).code, 404);
  assert.equal((await Deposits.privateProofPath(fixture.companyA.id, b.depositId)), null);
  assert.equal((await Crm.get(fixture.companyA.id, b.customerProfileId)).code, 404);
  assert.equal((await Closeouts.get(fixture.companyA.id, b.shiftId)).code, 404);
  assert.equal((await listRestaurantNotificationHistory(fixture.companyA.id, b.reservationId)).code, 404);
  assert.equal((await Waitlist.update(fixture.companyA.id, fixture.ownerA, b.waitlistId, { internal_notes: 'should-not-change' })).code, 404);
  const categories = (await Menu.listCategories(fixture.companyA.id)).data as any[];
  const items = ((await Menu.listItems(fixture.companyA.id, { limit: 100, page: 1 })).data as any).items as any[];
  assert.equal(categories.some((item: any) => item.id === b.categoryId), false);
  assert.equal(items.some((item: any) => item.id === b.itemId), false);
  assert.equal(await prisma.restaurantAuditLog.findFirst({ where: { id: b.auditLogId, company_id: fixture.companyA.id } }), null);
});

test('real MySQL rejects foreign nested IDs and enforces waiter ownership', { skip: skipReason }, async () => {
  assert.ok(fixture);
  const foreignVisit = await Visits.saveVisit(fixture.companyA.id, fixture.ownerA, { reservation_id: fixture.resourcesA.reservationId, table_id: fixture.resourcesB.tableId, total_paid_amount_cents: 1000 });
  assert.ok(foreignVisit.error);
  assert.ok([400, 409].includes(foreignVisit.code));
  const foreignSeat = await Waitlist.seat(fixture.companyA.id, fixture.ownerA, fixture.resourcesA.waitlistId, { table_id: fixture.resourcesB.tableId });
  assert.ok(foreignSeat.error);
  assert.ok([400, 409].includes(foreignSeat.code));
  const foreignSession = await Visits.saveVisit(fixture.companyA.id, fixture.ownerA, { reservation_id: fixture.resourcesA.reservationId, combination_session_id: fixture.resourcesB.combinationSessionId, total_paid_amount_cents: 1000 });
  assert.ok(foreignSession.error);
  const waiterForeignTable = await Visits.saveVisit(fixture.companyA.id, fixture.waiterA, { table_id: fixture.resourcesB.tableId, total_paid_amount_cents: 1000, complete: true }, true);
  assert.ok(waiterForeignTable.error);
  const waiterOwnTable = await Visits.saveVisit(fixture.companyA.id, fixture.waiterA, { table_id: fixture.resourcesA.tableId, total_paid_amount_cents: 1000 }, true);
  assert.equal(waiterOwnTable.error, false);
});

test('real MySQL serializes reservation transitions and notification claims', { skip: skipReason }, async () => {
  assert.ok(fixture);
  const transitions = await Promise.all([
    Reservations.changeStatus(fixture.companyA.id, fixture.resourcesA.reservationId, RestaurantReservationStatus.ARRIVED, undefined, fixture.ownerA),
    Reservations.changeStatus(fixture.companyA.id, fixture.resourcesA.reservationId, RestaurantReservationStatus.ARRIVED, undefined, fixture.ownerA),
  ]);
  assert.equal(transitions.filter((result) => !result.error).length, 1);
  assert.equal(transitions.filter((result) => result.error && result.code === 409).length, 1);

  const claim = { company_id: fixture.companyA.id, reservation_id: fixture.resourcesA.reservationId, event: RestaurantNotificationEvent.RESTAURANT_RESERVATION_CONFIRMED, channel: RestaurantNotificationChannel.EMAIL, status: RestaurantNotificationStatus.PENDING, trigger: RestaurantNotificationTrigger.AUTOMATIC, dedup_key: 'concurrent-claim', dedup_claim_key: `concurrent-claim-${Date.now()}` } as const;
  const claims = await Promise.all([restaurantNotificationLogRepo.claimAutomatic(claim), restaurantNotificationLogRepo.claimAutomatic(claim)]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test('real MySQL preserves deposit persistence when the configured email provider is unavailable', { skip: skipReason }, async () => {
  assert.ok(fixture);

  const originalEnv = new Map<string, string | undefined>([
    ['MAIL_ENABLED', process.env.MAIL_ENABLED],
    ['MAIL_TRANSPORT', process.env.MAIL_TRANSPORT],
    ['MAIL_HOST', process.env.MAIL_HOST],
    ['MAIL_PORT', process.env.MAIL_PORT],
    ['MAIL_FROM', process.env.MAIL_FROM],
    ['MAIL_USER', process.env.MAIL_USER],
    ['MAIL_PASS', process.env.MAIL_PASS],
  ]);

  try {
    process.env.MAIL_ENABLED = 'true';
    process.env.MAIL_TRANSPORT = 'remote';
    process.env.MAIL_HOST = '';
    process.env.MAIL_PORT = '587';
    process.env.MAIL_FROM = '';
    process.env.MAIL_USER = '';
    process.env.MAIL_PASS = '';

    await prisma.restaurantReservation.update({
      where: { id: fixture.resourcesA.reservationId },
      data: { customer_email: 'phase1-provider-failure@example.test' },
    });

    const response = await Deposits.reviewDeposit(
      fixture.companyA.id,
      fixture.resourcesA.depositId,
      fixture.ownerA,
      { action: 'REJECT', reason: 'Provider failure persistence regression' },
    );

    assert.equal(response.error, false);
    const persistedDeposit = await prisma.restaurantReservationDeposit.findUnique({
      where: { id: fixture.resourcesA.depositId },
      select: { status: true, rejection_reason: true },
    });
    assert.equal(persistedDeposit?.status, 'REJECTED');
    assert.equal(persistedDeposit?.rejection_reason, 'Provider failure persistence regression');

    const notificationResults = await notifyRestaurantReservation({
      companyId: fixture.companyA.id,
      reservationId: fixture.resourcesA.reservationId,
      event: RestaurantNotificationEvent.DEPOSIT_DEADLINE_REMINDER,
    });
    const emailResult = notificationResults.find((result) => result.channel === 'EMAIL');
    assert.equal(emailResult?.status, 'FAILED');
    assert.equal(emailResult?.reason, 'PROVIDER_NOT_CONFIGURED');

    const persistedNotification = await prisma.restaurantNotificationLog.findFirst({
      where: {
        company_id: fixture.companyA.id,
        reservation_id: fixture.resourcesA.reservationId,
        event: RestaurantNotificationEvent.DEPOSIT_DEADLINE_REMINDER,
        channel: RestaurantNotificationChannel.EMAIL,
      },
      orderBy: { id: 'desc' },
      select: { status: true, error_code: true, error_message: true },
    });
    assert.equal(persistedNotification?.status, 'FAILED');
    assert.equal(persistedNotification?.error_code, 'DELIVERY_FAILED');
    assert.equal(persistedNotification?.error_message, 'PROVIDER_NOT_CONFIGURED');
  } finally {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
