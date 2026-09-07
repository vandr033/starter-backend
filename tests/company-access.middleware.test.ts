import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopPlan } from '@prisma/client';
import type { NextFunction, Response } from 'express';
import { getLegacyPlanFallbackEntitlements } from '../src/services/company-entitlements.service';
import type { CompanyEntitlementPayload } from '../src/config/product-entitlements';
import type { EffectiveCompanyAccess } from '../src/services/company-access.service';
import {
  requireCompanyCapability,
  requireCompanyCapabilityDependencies,
} from '../src/middlewares/requireCompanyCapability';
import {
  requirePlanFeature,
  requirePlanFeatureDependencies,
} from '../src/middlewares/requirePlanFeature';
import { requireRestaurantShiftRole } from '../src/middlewares/requireRestaurantShiftRole';

function createResponseDouble() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as Response & { statusCode: number; body: unknown };
}

function createAccess(overrides: {
  mode?: EffectiveCompanyAccess['lifecycle']['mode'];
  entitlements?: CompanyEntitlementPayload;
  shiftRole?: EffectiveCompanyAccess['restaurant']['activeShiftRole'];
} = {}): EffectiveCompanyAccess {
  return {
    version: 1,
    companyId: 77,
    lifecycle: {
      mode: overrides.mode ?? 'FULL',
      isActive: overrides.mode !== 'BLOCKED',
      isExpired: overrides.mode === 'RENEWAL_ONLY',
      availableUntil: '2026-12-31T23:59:59.000Z',
      reason: overrides.mode === 'RENEWAL_ONLY'
        ? 'COMPANY_EXPIRED'
        : overrides.mode === 'BLOCKED'
          ? 'COMPANY_INACTIVE'
          : null,
    },
    membership: { id: 9, role: 'OWNER' },
    restaurant: {
      activeShiftId: overrides.shiftRole ? 901 : null,
      activeShiftRole: overrides.shiftRole ?? null,
    },
    entitlements: overrides.entitlements ?? getLegacyPlanFallbackEntitlements(ShopPlan.PRO),
    configuredProducts: [],
  };
}

test.afterEach(() => {
  requireCompanyCapabilityDependencies.companyHasCapability = async () => false;
  requirePlanFeatureDependencies.resolveFeatureAccessForCompany = async () => ({
    allowed: false,
    currentPlan: 'BUSINESS',
    requiredPlan: 'BUSINESS',
  });
  requirePlanFeatureDependencies.buildProductAccessForbiddenData = async () => null;
});

test('normalized capability middleware fails closed with FEATURE_NOT_ENTITLED', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async () => {
    throw new Error('legacy entitlement lookup should not run');
  };

  const req = { companyID: 77, companyAccess: createAccess() } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await requireCompanyCapability('COMMERCE_ACCESS')(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal((res.body as any).errorCode, 'FEATURE_NOT_ENTITLED');
  assert.equal((res.body as any).reason, 'FEATURE_NOT_ENTITLED');
  assert.equal((res.body as any).data.capability, 'COMMERCE_ACCESS');
});

test('normalized capability middleware uses the lifecycle contract before capability checks', async () => {
  const req = {
    companyID: 77,
    companyAccess: createAccess({ mode: 'RENEWAL_ONLY' }),
  } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await requireCompanyCapability('RESERVAS_BASE')(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal((res.body as any).errorCode, 'COMPANY_EXPIRED');
  assert.equal((res.body as any).data.mode, 'RENEWAL_ONLY');
});

test('normalized feature middleware reports feature entitlement failures with a stable error code', async () => {
  const entitlements = getLegacyPlanFallbackEntitlements(ShopPlan.STARTER);
  entitlements.features.GROUP_EVENTS = false;
  const req = { companyID: 77, companyAccess: createAccess({ entitlements }) } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  requirePlanFeatureDependencies.buildProductAccessForbiddenData = async () => null;

  await requirePlanFeature('GROUP_EVENTS')(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal((res.body as any).errorCode, 'FEATURE_NOT_ENTITLED');
  assert.equal((res.body as any).reason, 'FEATURE_NOT_ENTITLED');
  assert.equal((res.body as any).data.feature, 'GROUP_EVENTS');
});

test('normalized restaurant access enforces the current shift role', async () => {
  const req = {
    companyID: 77,
    authUser: { id: 'staff-77' },
    companyUser: { role: 'STAFF' },
    companyAccess: createAccess({ shiftRole: 'HOST' }),
  } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await requireRestaurantShiftRole(['HOST'])(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, true);
  assert.equal(req.restaurantShiftMember.role, 'HOST');
  assert.equal(req.restaurantShiftMember.shift_id, 901);
});

test('normalized restaurant access denies STAFF without an allowed current shift role', async () => {
  const req = {
    companyID: 77,
    authUser: { id: 'staff-77' },
    companyUser: { role: 'STAFF' },
    companyAccess: createAccess(),
  } as any;
  const res = createResponseDouble();

  await requireRestaurantShiftRole(['HOST'])(req, res, (() => {
    throw new Error('STAFF without a shift role must not proceed');
  }) as NextFunction);

  assert.equal(res.statusCode, 403);
  assert.equal((res.body as any).errorCode, 'RESTAURANT_SHIFT_ROLE_REQUIRED');
});
