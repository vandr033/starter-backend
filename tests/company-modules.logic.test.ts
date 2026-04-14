import test from 'node:test';
import assert from 'node:assert/strict';
import { ShopPlan } from '@prisma/client';
import { resolveCompanyModules } from '../src/services/company-modules.service';

test('company modules resolve reservations-only companies correctly', () => {
    assert.deepEqual(
        resolveCompanyModules({
            plan: ShopPlan.BUSINESS,
            reservations_enabled: true,
            store_enabled: false,
        }),
        {
            reservations: true,
            store: false,
        },
    );
});

test('company modules resolve store-only companies correctly', () => {
    assert.deepEqual(
        resolveCompanyModules({
            plan: ShopPlan.BUSINESS,
            reservations_enabled: false,
            store_enabled: true,
        }),
        {
            reservations: false,
            store: true,
        },
    );
});

test('company modules resolve hybrid companies correctly', () => {
    assert.deepEqual(
        resolveCompanyModules({
            plan: ShopPlan.PRO,
            reservations_enabled: true,
            store_enabled: true,
        }),
        {
            reservations: true,
            store: true,
        },
    );
});

test('company modules keep store disabled when the plan lacks store access', () => {
    assert.deepEqual(
        resolveCompanyModules({
            plan: ShopPlan.STARTER,
            reservations_enabled: false,
            store_enabled: true,
        }),
        {
            reservations: false,
            store: false,
        },
    );
});
