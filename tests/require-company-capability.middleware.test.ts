import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Response } from 'express';
import {
  requireCompanyCapability,
  requireCompanyCapabilityDependencies,
} from '../src/middlewares/requireCompanyCapability';

const originalCompanyHasCapability =
  requireCompanyCapabilityDependencies.companyHasCapability;

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

async function runMiddlewares(
  middlewares: Array<(req: any, res: any, next: NextFunction) => Promise<unknown>>,
  req: any,
  res: any,
): Promise<boolean> {
  let index = 0;
  let nextCalled = false;

  const next = (async () => {
    if (index >= middlewares.length) {
      nextCalled = true;
      return;
    }

    const middleware = middlewares[index];
    index += 1;
    await middleware(req, res, next as NextFunction);
  }) as NextFunction;

  await next();
  return nextCalled;
}

test.afterEach(() => {
  requireCompanyCapabilityDependencies.companyHasCapability =
    originalCompanyHasCapability;
});

test('requireCompanyCapability rejects missing company context', async () => {
  const middleware = requireCompanyCapability('RESERVAS_BASE');
  const req = {} as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await middleware(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    code: 400,
    error: true,
    message: 'Company context not found',
  });
});

test('requireCompanyCapability returns a clean public 403 when the product is inactive', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async () => false;

  const middleware = requireCompanyCapability('EVENTOS_BASE');
  const req = { companyID: 17 } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await middleware(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: 403,
    error: true,
    reason: 'PRODUCT_NOT_ACTIVE',
    message: 'Events are not available for this business',
    data: {
      capability: 'EVENTOS_BASE',
    },
  });
  assert.equal((res.body as any).data.ctaLabel, undefined);
});

test('requireCompanyCapability calls next when the company has the requested capability', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async () => true;

  const middleware = requireCompanyCapability('CLASES_PRO');
  const req = { companyID: 11 } as any;
  const res = createResponseDouble();
  let nextCalled = false;

  await middleware(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

test('company with CRM Base can view customers', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async (_companyId, capability) =>
    capability === 'CRM_BASE';

  const res = createResponseDouble();
  const nextCalled = await runMiddlewares(
    [requireCompanyCapability('CRM_BASE')],
    { companyID: 31 },
    res,
  );

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('company without CRM Pro cannot export customers', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async () => false;

  const res = createResponseDouble();
  const nextCalled = await runMiddlewares(
    [requireCompanyCapability('CRM_PRO')],
    { companyID: 31 },
    res,
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: 403,
    error: true,
    reason: 'PRODUCT_NOT_ACTIVE',
    message: 'This feature is not available for this business',
    data: {
      capability: 'CRM_PRO',
    },
  });
});

test('company with CRM Pro can export customers', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async (_companyId, capability) =>
    capability === 'CRM_PRO';

  const res = createResponseDouble();
  const nextCalled = await runMiddlewares(
    [requireCompanyCapability('CRM_PRO')],
    { companyID: 31 },
    res,
  );

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('company with CRM Pro but without Mensajeria Pro cannot send bulk WhatsApp', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async (_companyId, capability) =>
    capability === 'CRM_PRO';

  const res = createResponseDouble();
  const nextCalled = await runMiddlewares(
    [
      requireCompanyCapability('CRM_PRO'),
      requireCompanyCapability('MENSAJERIA_PRO'),
    ],
    { companyID: 31 },
    res,
  );

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    code: 403,
    error: true,
    reason: 'PRODUCT_NOT_ACTIVE',
    message: 'This feature is not available for this business',
    data: {
      capability: 'MENSAJERIA_PRO',
    },
  });
});

test('company with CRM Pro and Mensajeria Pro can send bulk WhatsApp', async () => {
  requireCompanyCapabilityDependencies.companyHasCapability = async (_companyId, capability) =>
    capability === 'CRM_PRO' || capability === 'MENSAJERIA_PRO';

  const res = createResponseDouble();
  const nextCalled = await runMiddlewares(
    [
      requireCompanyCapability('CRM_PRO'),
      requireCompanyCapability('MENSAJERIA_PRO'),
    ],
    { companyID: 31 },
    res,
  );

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
