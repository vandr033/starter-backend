import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Response } from 'express';
import {
  requirePlanFeature,
  requirePlanFeatureDependencies,
} from '../src/middlewares/requirePlanFeature';

const originalResolveFeatureAccessForCompany =
  requirePlanFeatureDependencies.resolveFeatureAccessForCompany;
const originalBuildProductAccessForbiddenData =
  requirePlanFeatureDependencies.buildProductAccessForbiddenData;

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
  } as Response & {
    statusCode: number;
    body: unknown;
  };
}

test.afterEach(() => {
  requirePlanFeatureDependencies.resolveFeatureAccessForCompany =
    originalResolveFeatureAccessForCompany;
  requirePlanFeatureDependencies.buildProductAccessForbiddenData =
    originalBuildProductAccessForbiddenData;
});

test('company without Mensajeria Pro cannot send booking reminders', async () => {
  requirePlanFeatureDependencies.resolveFeatureAccessForCompany = async () => ({
    allowed: false,
    currentPlan: 'BUSINESS',
    requiredPlan: 'PRO',
  });
  requirePlanFeatureDependencies.buildProductAccessForbiddenData = async () => ({
    missingCapability: 'MENSAJERIA_REMINDERS',
    recommendedProductCode: 'MENSAJERIA',
    recommendedTierCode: 'MENSAJERIA_PRO',
    recommendedProductName: 'Mensajeria Pro',
    recommendedTierName: 'Mensajeria Pro',
    requestLabel: 'Mensajeria Pro',
    ctaLabel: 'Solicitar Mensajeria Pro',
    title: 'Este modulo no esta activo para tu empresa.',
    description: 'Solicita activar Mensajeria Pro y nuestro equipo revisara tu solicitud.',
    requiresLabel: 'Requiere Mensajeria Pro',
    pendingRequest: null,
    hasPendingRequest: false,
  });

  const middleware = requirePlanFeature('BOOKING_REMINDERS');
  const req = { companyID: 24 } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await middleware(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal((res.body as any).message, 'Requiere Mensajeria Pro');
  assert.equal((res.body as any).data.feature, 'BOOKING_REMINDERS');
  assert.equal((res.body as any).data.recommendedTierCode, 'MENSAJERIA_PRO');
});

test('Mensajeria Base still allows transactional booking notifications', async () => {
  requirePlanFeatureDependencies.resolveFeatureAccessForCompany = async () => ({
    allowed: true,
    currentPlan: 'STARTER',
    requiredPlan: 'BUSINESS',
  });

  const middleware = requirePlanFeature('TRANSACTIONAL_BOOKING_NOTIFICATIONS');
  const req = { companyID: 9 } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await middleware(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});
