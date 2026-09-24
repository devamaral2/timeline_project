import 'reflect-metadata';
import { Readable } from 'node:stream';
import type { Request } from 'express';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { expect, test, vi } from 'vitest';
import { TranscriptionGateway } from './transcription.gateway';
import { TranscribeAudioController } from './transcribe-audio.controller';
import { readAudioBody, MAX_AUDIO_BYTES } from './audio-body';
import { GatewayIdentityGuard } from '../../http/request-identity/gateway-identity.guard';
import { getServerEnv } from '../../config/env';

const id = '6099604e-d348-4599-b48d-9c7fc18ea929';
const actor = { userId: 'ana' };
const env = getServerEnv({
  AUDIO_TRANSCRIPTION_ENABLED: 'true',
  AUDIO_TRANSCRIPTION_URL: 'http://worker:8001',
  AUDIO_TRANSCRIPTION_KEY: 'k'.repeat(32),
});
function request(
  chunks: Buffer[],
  headers: Record<string, string> = {},
): Request {
  return Object.assign(Readable.from(chunks), {
    headers: { 'content-type': 'audio/webm', 'x-recording-id': id, ...headers },
  }) as unknown as Request;
}

test("all audio routes require the gateway's authenticated identity", () => {
  expect(
    Reflect.getMetadata(GUARDS_METADATA, TranscribeAudioController),
  ).toContain(GatewayIdentityGuard);
});

test('passes raw audio and trusted user to worker; polling and cancellation do not create messages', async () => {
  const send = vi
    .fn()
    .mockImplementation(async (_url, init) =>
      Response.json({
        id,
        status: init.method === 'DELETE' ? 'cancelled' : 'pending',
      }),
    );
  const controller = new TranscribeAudioController(
    new TranscriptionGateway(env, send),
  );
  expect(
    await controller.upload(request([Buffer.from([0, 255, 128])]), actor),
  ).toEqual({ id, status: 'pending' });
  expect(send.mock.calls[0][0]).toBe(
    `http://worker:8001/v1/transcriptions/${id}`,
  );
  expect(send.mock.calls[0][1].headers).toMatchObject({
    'X-Transcription-User': 'ana',
    Authorization: `Bearer ${env.AUDIO_TRANSCRIPTION_KEY}`,
  });
  expect(
    new Uint8Array(await send.mock.calls[0][1].body.arrayBuffer()),
  ).toEqual(new Uint8Array([0, 255, 128]));
  await controller.get(id, actor);
  expect(await controller.cancel(id, actor)).toEqual({
    id,
    status: 'cancelled',
  });
  expect(send.mock.calls.map((call) => call[1].method)).toEqual([
    'POST',
    'GET',
    'DELETE',
  ]);
});

test('rejects unknown ID and oversized, empty or unsupported media before contacting inference', async () => {
  const send = vi.fn();
  const controller = new TranscribeAudioController(
    new TranscriptionGateway(env, send),
  );
  await expect(
    controller.upload(
      request([Buffer.from('x')], { 'x-recording-id': 'invalid' }),
      actor,
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    readAudioBody(
      request([], { 'content-length': String(MAX_AUDIO_BYTES + 1) }),
    ),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    readAudioBody(request([Buffer.alloc(MAX_AUDIO_BYTES), Buffer.from('x')])),
  ).rejects.toMatchObject({ status: 413 });
  await expect(readAudioBody(request([]))).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    readAudioBody(request([], { 'content-type': 'application/json' })),
  ).rejects.toMatchObject({ status: 415 });
  expect(send).not.toHaveBeenCalled();
});

test('disabled rollout does not contact service and errors never leak provider details', async () => {
  const send = vi.fn().mockRejectedValue(new Error('secret transcript'));
  const disabled = new TranscriptionGateway(
    { ...env, AUDIO_TRANSCRIPTION_ENABLED: 'false' },
    send,
  );
  expect(new TranscribeAudioController(disabled).capabilities()).toEqual({
    enabled: false,
  });
  await expect(disabled.request('ana', id, 'GET')).rejects.toMatchObject({
    status: 503,
  });
  expect(send).not.toHaveBeenCalled();
  await expect(
    new TranscriptionGateway(env, send).request('ana', id, 'GET'),
  ).rejects.toMatchObject({
    status: 503,
    message: 'Transcription is unavailable',
  });
});

test.each([404, 409, 429])(
  'preserves actionable upstream status %s',
  async (status) => {
    const gateway = new TranscriptionGateway(
      env,
      vi.fn().mockResolvedValue(new Response(null, { status })),
    );
    await expect(gateway.request('ana', id, 'GET')).rejects.toMatchObject({
      status,
    });
  },
);
