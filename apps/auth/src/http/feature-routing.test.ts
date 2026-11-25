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

  it.each(['/auth/logout-all', '/auth/me', '/api/tasks'])('routes protected endpoint %s through auth guards', async (path) => {
    const response = await fetch(`${testApp.url}${path}`, { method: path === '/auth/me' ? 'GET' : 'POST' });
    expect(response.status).toBe(401);
  });

  it('lets only the daily-reading route carry a page-sized body', async () => {
    const body = JSON.stringify({ markdown: 'a'.repeat(200 * 1024) });
    const post = (path: string) =>
      fetch(`${testApp.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

    // O corpo foi lido e a rota parou onde deve: na falta do bearer.
    expect((await post('/api/tasks/daily-reading')).status).toBe(401);
    expect((await post('/api/tasks')).status).toBe(413);
    expect((await post('/auth/login')).status).toBe(413);
  });

  it('still caps the daily-reading body', async () => {
    const response = await fetch(`${testApp.url}/api/tasks/daily-reading`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ markdown: 'a'.repeat(1024 * 1024) }),
    });
    expect(response.status).toBe(413);
  });

  it('keeps the JWKS transport endpoint outside feature modules', async () => {
    const response = await fetch(`${testApp.url}/.well-known/jwks.json`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ keys: [] });
  });
});
