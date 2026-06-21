import assert from 'node:assert/strict';
import test from 'node:test';
import { requireSuperAdmin } from '../src/middlewares/requireAuth';

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test('super admin access is allowed for WAHA dashboard endpoints', async () => {
  const req = {
    originalUrl: '/api/super-admin/waha/status',
    authUser: {
      id: 'user-1',
      email: 'super-admin@example.com',
      is_super_admin: true,
    },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  requireSuperAdmin(req, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test('non-super-admin users receive 403 for WAHA dashboard endpoints', async () => {
  const req = {
    originalUrl: '/api/super-admin/waha/status',
    authUser: {
      id: 'user-2',
      email: 'staff@example.com',
      is_super_admin: false,
    },
  } as any;
  const res = createMockResponse();
  let nextCalled = false;

  requireSuperAdmin(req, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Forbidden' });
});
