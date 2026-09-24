import 'reflect-metadata';
import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { afterEach, expect, test, vi } from 'vitest';
import { ApiGatewayController } from './api-gateway.controller';
import { audioUpload } from './audio-upload';
import type { AuthorizationService } from '../../auth-core/security/authorization.service';
import type { RuntimeEnv } from '../../config/env';
import type { AuthenticatedActor } from '../../domain/users/user';

afterEach(() => vi.unstubAllGlobals());
function request(headers: Record<string, string> = {}): Request {
  return Object.assign(Readable.from([Buffer.from([0, 255, 128])]), {
    method: 'POST',
    path: '/api/audio/transcriptions',
    originalUrl: '/api/audio/transcriptions',
    headers: {
      'content-type': 'audio/mp4',
      'x-recording-id': 'recording',
      'x-auth-user-id': 'spoofed',
      ...headers,
    },
  }) as unknown as Request;
}

test("gateway preserves binary audio and overwrites the caller's identity after authorization", async () => {
  const execute = vi.fn().mockResolvedValue({});
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ status: 'pending' }, { status: 202 }));
  vi.stubGlobal('fetch', fetch);
  const response = {
    status: vi.fn(),
    setHeader: vi.fn(),
    send: vi.fn(),
  } as unknown as Response;
  const controller = new ApiGatewayController(
    { execute } as unknown as AuthorizationService,
    {
      internalServiceKey: 'internal-key',
      apiServiceUrl: 'http://api:3001',
    } as RuntimeEnv,
  );
  await controller.forward(request(), response, undefined, {
    userId: 'ana',
    sessionId: 'session',
  } as AuthenticatedActor);
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({
      resource: 'agent',
      action: 'execute',
      userId: 'ana',
    }),
  );
  const init = fetch.mock.calls[0][1];
  expect(init.headers.get('x-auth-user-id')).toBe('ana');
  expect(init.headers.get('content-type')).toBe('audio/mp4');
  expect(new Uint8Array(await init.body.arrayBuffer())).toEqual(
    new Uint8Array([0, 255, 128]),
  );
  expect(response.status).toHaveBeenCalledWith(202);
});

test('rejects oversized audio without increasing the JSON request limit', async () => {
  await expect(
    audioUpload(request({ 'content-length': String(20 * 1024 * 1024 + 1) })),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    audioUpload(request({ 'content-type': 'application/json' })),
  ).rejects.toMatchObject({ status: 415 });
});

test('unauthorized uploads never reach the upstream', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const controller = new ApiGatewayController(
    {
      execute: vi.fn().mockRejectedValue(new Error('denied')),
    } as unknown as AuthorizationService,
    {} as RuntimeEnv,
  );
  await expect(
    controller.forward(request(), {} as Response, undefined, {
      userId: 'ana',
      sessionId: 'session',
    } as AuthenticatedActor),
  ).rejects.toThrow('denied');
  expect(fetch).not.toHaveBeenCalled();
});
