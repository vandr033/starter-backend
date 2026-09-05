import assert from 'node:assert/strict';
import test from 'node:test';

import { combineServiceNotificationAudiences } from '../src/utils/bookingNotifications';

test('service notification audience keeps the established defaults without service policies', () => {
    assert.deepEqual(combineServiceNotificationAudiences([]), {
        customer: true,
        assignedStaff: true,
        management: true,
    });
});

test('multi-service bookings include a group when any selected service enables it', () => {
    assert.deepEqual(
        combineServiceNotificationAudiences([
            {
                notify_customer: false,
                notify_assigned_staff: true,
                notify_management: false,
            },
            {
                notify_customer: true,
                notify_assigned_staff: false,
                notify_management: false,
            },
        ]),
        {
            customer: true,
            assignedStaff: true,
            management: false,
        },
    );
});

test('a service can disable every new-booking recipient group', () => {
    assert.deepEqual(
        combineServiceNotificationAudiences([
            {
                notify_customer: false,
                notify_assigned_staff: false,
                notify_management: false,
            },
        ]),
        {
            customer: false,
            assignedStaff: false,
            management: false,
        },
    );
});
