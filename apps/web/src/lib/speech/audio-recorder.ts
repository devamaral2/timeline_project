export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_RECORDING_MS = 120_000;
const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

export function recordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

interface Callbacks {
  started: (settings: MediaTrackSettings) => void;
  progress: (seconds: number, level: number) => void;
  complete: (audio: Blob) => void;
  error: (message: string) => void;
}

/** One owner for microphone, recorder, timers and AudioContext, including permission races. */
export class AudioCapture {
  private closed = false;
  private stopping = false;
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private context?: AudioContext;
  private timer?: ReturnType<typeof setTimeout>;
  private meter?: ReturnType<typeof setInterval>;
  private chunks: Blob[] = [];
  private size = 0;

  constructor(private readonly callbacks: Callbacks) {}

  async start(): Promise<void> {
    try {
      const mimeType = recordingMimeType();
      if (!mimeType) throw new Error('unsupported');
      // Construct/resume inside the click gesture, before the permission promise (iOS).
      if (typeof AudioContext !== 'undefined') {
        try {
          this.context = new AudioContext();
          void this.context.resume().catch(() => {});
        } catch {
          /* Capture can continue without a meter. */
        }
      }
      const supported = navigator.mediaDevices.getSupportedConstraints();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(supported.echoCancellation
            ? { echoCancellation: { ideal: true } }
            : {}),
          ...(supported.noiseSuppression
            ? { noiseSuppression: { ideal: true } }
            : {}),
          ...(supported.autoGainControl
            ? { autoGainControl: { ideal: true } }
            : {}),
          ...(supported.channelCount ? { channelCount: { ideal: 1 } } : {}),
        },
      });
      if (this.closed) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended')
        throw new Error('missing microphone');
      track.onended = () =>
        this.fail('O microfone foi desconectado. Grave novamente.');
      track.onmute = () =>
        this.fail('A gravação foi interrompida. Grave novamente.');
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128_000,
      });
      this.recorder = recorder;
      recorder.onstart = () => {
        if (this.closed) return;
        const started = performance.now();
        this.callbacks.started(track.getSettings());
        // Reserve a small margin for the codec's trailing frames; decoded audio is capped at 120s.
        this.timer = setTimeout(() => this.stop(), MAX_RECORDING_MS - 250);
        let analyser: AnalyserNode | undefined;
        try {
          if (this.context) {
            analyser = this.context.createAnalyser();
            analyser.fftSize = 512;
            this.context.createMediaStreamSource(stream).connect(analyser);
          }
        } catch {
          /* Metering must not prevent capture. */
        }
        const samples = new Float32Array(512);
        this.meter = setInterval(() => {
          if (this.closed) return;
          analyser?.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(
            samples.reduce((sum, sample) => sum + sample * sample, 0) /
              samples.length,
          );
          this.callbacks.progress(
            Math.min(120, (performance.now() - started) / 1000),
            Math.min(1, rms * 5),
          );
        }, 100);
      };
      recorder.ondataavailable = ({ data }) => {
        if (this.closed || !data.size) return;
        this.size += data.size;
        if (this.size > MAX_AUDIO_BYTES)
          return this.fail(
            'O áudio ficou grande demais. Grave uma mensagem menor.',
          );
        this.chunks.push(data);
      };
      recorder.onerror = () =>
        this.fail('Não foi possível gravar o áudio. Tente novamente.');
      recorder.onstop = () => {
        if (this.closed) return;
        if (!this.stopping)
          return this.fail('A gravação foi interrompida. Grave novamente.');
        // onstop follows the final dataavailable; never upload earlier.
        const audio = new Blob(this.chunks, {
          type: recorder.mimeType || mimeType,
        });
        this.release();
        if (audio.size) this.callbacks.complete(audio);
        else
          this.callbacks.error(
            'Não recebi áudio do microfone. Tente novamente.',
          );
      };
      recorder.start(250);
    } catch (error) {
      if (this.closed) return;
      this.fail(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone para gravar.'
          : 'Não foi possível iniciar o microfone. Verifique se ele está disponível.',
      );
    }
  }

  stop(): void {
    if (this.closed || this.stopping || !this.recorder) return;
    this.stopping = true;
    clearTimeout(this.timer);
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }

  cancel(): void {
    this.release();
  }

  private fail(message: string): void {
    if (this.closed) return;
    this.release();
    this.callbacks.error(message);
  }

  private release(): void {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.meter);
    if (this.recorder) {
      this.recorder.ondataavailable =
        this.recorder.onstart =
        this.recorder.onstop =
        this.recorder.onerror =
          null;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
    }
    this.stream?.getTracks().forEach((track) => {
      track.onended = track.onmute = null;
      track.stop();
    });
    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => {});
    this.chunks = [];
  }
}
