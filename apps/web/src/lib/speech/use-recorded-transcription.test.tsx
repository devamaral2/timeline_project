import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useRecordedTranscription } from './use-recorded-transcription';

const mocks = vi.hoisted(() => ({
  transcribe: vi.fn(),
  cancel: vi.fn(),
  enabled: vi.fn(),
  captures: [] as Array<{
    callbacks: {
      started: (settings: object) => void;
      complete: (audio: Blob) => void;
    };
    cancel: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('./audio-recorder', () => ({
  recordingMimeType: () => 'audio/webm',
  AudioCapture: class {
    cancel = vi.fn();
    constructor(
      readonly callbacks: (typeof mocks.captures)[number]['callbacks'],
    ) {
      mocks.captures.push(this);
    }
    async start() {
      this.callbacks.started({});
    }
    stop() {
      this.callbacks.complete(new Blob(['audio'], { type: 'audio/webm' }));
    }
  },
}));
vi.mock('./transcription-client', async (original) => ({
  ...(await original<typeof import('./transcription-client')>()),
  transcribeRecording: mocks.transcribe,
  cancelTranscription: mocks.cancel,
  transcriptionEnabled: mocks.enabled,
}));

beforeEach(() => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
  mocks.captures = [];
  mocks.enabled.mockReset().mockResolvedValue(true);
  mocks.transcribe.mockReset();
  mocks.cancel.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const onTranscript = vi.fn();
  const hook = renderHook(
    ({ scope }) => useRecordedTranscription({ scope, onTranscript }),
    { initialProps: { scope: 'user:conversation' } },
  );
  await waitFor(() => expect(hook.result.current.supported).toBe(true));
  act(() => hook.result.current.start());
  return { ...hook, onTranscript };
}

test('delivers one result even if stop or final callbacks repeat', async () => {
  mocks.transcribe.mockResolvedValue('não, não, amanhã');
  const { result, onTranscript } = await setup();
  await act(async () => {
    result.current.stop();
    mocks.captures[0].callbacks.complete(new Blob(['late']));
  });
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  expect(onTranscript).toHaveBeenCalledTimes(1);
  expect(onTranscript).toHaveBeenCalledWith('não, não, amanhã');
});

test('network retry keeps the same recording ID and original audio', async () => {
  mocks.transcribe
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValueOnce('amanhã');
  const { result, onTranscript } = await setup();
  await act(async () => result.current.stop());
  expect(result.current.canRetry).toBe(true);
  await act(async () => result.current.retry());
  expect(mocks.transcribe.mock.calls[1].slice(0, 2)).toEqual(
    mocks.transcribe.mock.calls[0].slice(0, 2),
  );
  expect(onTranscript).toHaveBeenCalledTimes(1);
  expect(onTranscript).toHaveBeenCalledWith('amanhã');
});

test.each(['cancel', 'scope', 'unmount'])(
  '%s ignores a late transcription result',
  async (mode) => {
    let resolve!: (text: string) => void;
    mocks.transcribe.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result, onTranscript, rerender, unmount } = await setup();
    act(() => result.current.stop());
    act(() => {
      if (mode === 'cancel') result.current.cancel();
      else if (mode === 'scope') rerender({ scope: 'another-user:new' });
      else unmount();
    });
    await act(async () => resolve('old result'));
    expect(onTranscript).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledOnce();
  },
);

test('disabled configuration never enables the microphone', async () => {
  mocks.enabled.mockResolvedValue(false);
  const { result } = renderHook(() =>
    useRecordedTranscription({ scope: 'user:new', onTranscript: vi.fn() }),
  );
  await act(async () => {});
  act(() => result.current.start());
  expect(result.current.supported).toBe(false);
  expect(mocks.captures).toHaveLength(0);
});
