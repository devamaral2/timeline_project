import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../testing/create-test-app';

describe('auth feature routing', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it.each([
    ['/auth/login', { email: '', password: '' }],
    ['/auth/token/refresh', {}],
    ['/auth/logout', {}],
    ['/auth/invites/inspect', {}],
    ['/auth/invites/accept', {}],
    ['/auth/admin/invites', {}],
  ])('routes %s to its feature controller', async (path, body) => {
    const response = await fetch(`${testApp.url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).not.toBe(404);
  });

  it.each(['/auth/logout-all', '/auth/me', '/api/events'])('routes protected endpoint %s through auth guards', async (path) => {
    const response = await fetch(`${testApp.url}${path}`, { method: path === '/auth/me' ? 'GET' : 'POST' });
    expect(response.status).toBe(401);
  });

  it('keeps the JWKS transport endpoint outside feature modules', async () => {
    const response = await fetch(`${testApp.url}/.well-known/jwks.json`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ keys: [] });
  });
});
