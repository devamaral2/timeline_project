import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AudioCapture, MAX_RECORDING_MS } from './audio-recorder';

class Recorder {
  static instance: Recorder;
  static isTypeSupported = (type: string) => type === 'audio/mp4';
  state = 'inactive';
  mimeType = 'audio/mp4';
  onstart?: () => void;
  onstop?: () => void;
  onerror?: () => void;
  ondataavailable?: (event: { data: Blob }) => void;
  constructor() {
    Recorder.instance = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
  }
}
let track: {
  stop: ReturnType<typeof vi.fn>;
  readyState: string;
  getSettings: () => MediaTrackSettings;
  onended?: () => void;
};
let stream: MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaRecorder', Recorder);
  track = {
    stop: vi.fn(),
    readyState: 'live',
    getSettings: () => ({ echoCancellation: true }),
  };
  stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia,
      getSupportedConstraints: () => ({ echoCancellation: true }),
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const callbacks = {
    started: vi.fn(),
    progress: vi.fn(),
    complete: vi.fn(),
    error: vi.fn(),
  };
  return { capture: new AudioCapture(callbacks), ...callbacks };
}

test('waits for actual capture and includes the last blob emitted after stop', async () => {
  const { capture, started, complete } = setup();
  await capture.start();
  expect(started).not.toHaveBeenCalled();
  Recorder.instance.onstart?.();
  expect(started).toHaveBeenCalledWith({ echoCancellation: true });
  Recorder.instance.ondataavailable?.({ data: new Blob(['first']) });
  capture.stop();
  expect(complete).not.toHaveBeenCalled();
  Recorder.instance.ondataavailable?.({ data: new Blob(['last']) });
  Recorder.instance.onstop?.();
  Recorder.instance.onstop?.();
  expect(complete).toHaveBeenCalledTimes(1);
  expect(complete.mock.calls[0][0]).toMatchObject({
    size: 9,
    type: 'audio/mp4',
  });
  expect(track.stop).toHaveBeenCalledTimes(1);
});

test('cancelling while permission is pending releases the later stream without starting', async () => {
  let resolve!: (stream: MediaStream) => void;
  getUserMedia.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { capture, started, complete } = setup();
  const pending = capture.start();
  capture.cancel();
  resolve(stream);
  await pending;
  expect(track.stop).toHaveBeenCalledOnce();
  expect(started).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

test('two-minute limit stops once and still waits for the final data', async () => {
  const { capture, complete } = setup();
  await capture.start();
  Recorder.instance.onstart?.();
  vi.advanceTimersByTime(MAX_RECORDING_MS);
  expect(Recorder.instance.state).toBe('inactive');
  expect(complete).not.toHaveBeenCalled();
  Recorder.instance.ondataavailable?.({ data: new Blob(['tail']) });
  Recorder.instance.onstop?.();
  expect(complete).toHaveBeenCalledOnce();
});

test('a disconnected microphone discards partial audio and releases resources', async () => {
  const { capture, error, complete } = setup();
  await capture.start();
  Recorder.instance.onstart?.();
  track.onended?.();
  expect(error).toHaveBeenCalledWith(expect.stringMatching(/desconectado/));
  expect(complete).not.toHaveBeenCalled();
  expect(track.stop).toHaveBeenCalledOnce();
});

test('permission denied gives an actionable error', async () => {
  getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  const { capture, error } = setup();
  await capture.start();
  expect(error).toHaveBeenCalledWith(expect.stringMatching(/Permita/));
});
