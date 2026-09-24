import { afterEach, expect, test, vi } from 'vitest';
import { transcribeRecording } from './transcription-client';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/api/authed-fetch', () => ({ sendWithSession: send }));
afterEach(() => {
  vi.useRealTimers();
  send.mockReset();
});
const id = '6099604e-d348-4599-b48d-9c7fc18ea929';

test('uploads binary once and polls without concatenating results', async () => {
  vi.useFakeTimers();
  send
    .mockResolvedValueOnce(Response.json({ id, status: 'pending' }))
    .mockResolvedValueOnce(Response.json({ id, status: 'processing' }))
    .mockResolvedValueOnce(
      Response.json({ id, status: 'completed', text: 'não, não' }),
    );
  const audio = new Blob(['voice'], { type: 'audio/mp4' });
  const promise = transcribeRecording(id, audio, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1500);
  expect(await promise).toBe('não, não');
  expect(send).toHaveBeenCalledTimes(3);
  expect(send.mock.calls[0][1]).toMatchObject({
    body: audio,
    headers: { 'Content-Type': 'audio/mp4', 'X-Recording-Id': id },
  });
});

test.each([404, 429, 503])(
  'status %s keeps the recording eligible for resubmission',
  async (status) => {
    send.mockResolvedValue(new Response(null, { status }));
    await expect(
      transcribeRecording(
        id,
        new Blob(['voice']),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ retryable: true });
  },
);

test('silence does not produce a message or an automatic retry', async () => {
  send.mockResolvedValue(
    Response.json({ id, status: 'failed', error: 'no_speech' }),
  );
  await expect(
    transcribeRecording(
      id,
      new Blob(['silence']),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ retryable: false });
});
