import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCustomerCategoryFilter } from '../src/repositories/customer.repo';

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
