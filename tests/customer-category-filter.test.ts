import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma/client';
import { buildCustomerCategoryFilter, getCustomersWithBookingStats } from '../src/repositories/customer.repo';
import { exportCustomers, listCustomers } from '../src/services/customer.service';
import { runWithDemoRequestContext } from '../src/services/demo-request-context';

function mockQuery<Target, Key extends keyof Target, Query extends (...args: never[]) => unknown>(
    t: TestContext, target: Target, key: Key, query: Query,
) {
    const original = target[key];
    const mocked = t.mock.fn(query);
    target[key] = mocked as unknown as Target[Key];
    t.after(() => { target[key] = original; });
    return mocked;
}

test('customer category filter covers services, events, classes, and interest captures', () => {
    const categoryId = 42;

    assert.deepEqual(buildCustomerCategoryFilter(categoryId), {
        OR: [
            { bookings: { some: { deleted_at: null, booking_services: { some: { service: { category_id: categoryId } } } } } },
            { group_event_bookings: { some: { group_event: { is: { category_id: categoryId, deleted_at: null } } } } },
            { group_class_enrollments: { some: { group_class: { is: { category_id: categoryId, deleted_at: null } } } } },
            { group_event_interests: { some: { group_event: { is: { category_id: categoryId, deleted_at: null } } } } },
            { group_class_interests: { some: { group_class: { is: { category_id: categoryId, deleted_at: null } } } } },
        ],
    });
});

test('event filters include waitlists and export the same customers as the preview', async (t) => {
    const user = { id: 'registered', name: 'Paid Waitlist', email: 'paid@example.test', deleted_at: null };
    const guest = {
        id: 11, user: null, first_name: 'Free', last_name: 'Waitlist',
        email: 'free@example.test', phone_prefix: '591', phone_number: '12345678', status: 'INTERESTED',
    };
    mockQuery(t, prisma.customerProfile, 'findMany', async () => []);
    mockQuery(t, prisma.booking, 'findMany', async () => []);
    mockQuery(t, prisma.customerCrmRecord, 'findMany', async () => []);
    mockQuery(t, prisma.company, 'findUnique', async () => ({ id: 7, name: 'Demo', slug: 'demo' }));
    mockQuery(t, prisma.groupEventInterest, 'findMany', async () => []);
    const eventBookings = mockQuery(t, prisma.groupEventBooking, 'findMany', async (args: Prisma.GroupEventBookingFindManyArgs) => {
        const event = args.where?.group_event;
        return event && 'is_free' in event && event.is_free === false ? [{ id: 21, user, status: 'WAITLISTED' }] : [];
    });
    const freeRegistrations = mockQuery(t, prisma.freeEventRegistration, 'findMany', async (_args: Prisma.FreeEventRegistrationFindManyArgs) => [guest, guest]);

    const paid = await listCustomers(7, undefined, 'ALL', 42, undefined, 'PAID_EVENT');
    assert.deepEqual(paid.map((customer) => customer.email), ['paid@example.test']);
    assert.deepEqual(eventBookings.mock.calls[0]?.arguments[0]?.where, {
        company_id: 7,
        status: { not: 'CANCELLED' },
        group_event: { company_id: 7, category_id: 42, deleted_at: null, is_free: false },
    });
    assert.equal(freeRegistrations.mock.callCount(), 0);

    const free = await listCustomers(7, 'free', 'ALL', 42, undefined, 'FREE_EVENT');
    assert.deepEqual(free.map((customer) => customer.email), ['free@example.test']);
    assert.deepEqual(freeRegistrations.mock.calls[0]?.arguments[0]?.where, {
        company_id: 7,
        group_event: { is: { company_id: 7, category_id: 42, deleted_at: null } },
    });
    const result = await runWithDemoRequestContext(
        { isDemo: true, sessionId: 'test', profileKey: 'test', companyId: 7 },
        () => exportCustomers(7, { search: 'free', categoryId: 42, activityType: 'FREE_EVENT' }),
    );
    assert.equal(result.data?.totalRows, free.length);
    assert.match(result.data?.csv ?? '', /\nFree Waitlist,free@example\.test,591,12345678,/);
});

test('service activity matches the category on the same reservation and omits calendar blocks', async (t) => {
    const booking = (id: number, name: string, categoryId: number, bookingType = 'CUSTOMER') => ({
        id, client_name: name, booking_type: bookingType,
        start_at: new Date('2026-01-01'), status: 'CONFIRMED', total_price_cents: 100,
        staff: { display_name: 'Staff' }, booking_services: [{ service: { category: { id: categoryId } } }],
    });
    mockQuery(t, prisma.customerProfile, 'findMany', async () => []);
    mockQuery(t, prisma.customerCrmRecord, 'findMany', async () => []);
    mockQuery(t, prisma.booking, 'findMany', async () => [
        booking(1, 'Regular', 42),
        { ...booking(2, 'Regular', 43), booking_group: { group_type: 'RECURRING_SERVICE' } },
        { ...booking(3, 'Batch', 42), booking_group: { group_type: 'RECURRING_SERVICE' } },
        { ...booking(4, 'Package', 42), session_count: 3 },
        booking(5, 'Block', 42, 'BLOCK'),
    ]);

    const regular = await getCustomersWithBookingStats(7, undefined, 42, undefined, 'SERVICE');
    assert.deepEqual(regular.map((customer) => [customer.name, customer.totalBookings]), [['Regular', 2]]);
    const recurring = await getCustomersWithBookingStats(7, undefined, 42, undefined, 'RECURRING_SERVICE');
    assert.deepEqual(recurring.map((customer) => customer.name), ['Batch', 'Package']);
});
