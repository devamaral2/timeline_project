import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { AudioFile, Diarizer, Whisper } from "../ports";
import type { SpeakerTurn, TimedText } from "../types";
import type { CommandRunner } from "./command-runner";
import { parseDiarization } from "./diarization-json";
import { parseWhisperJson } from "./whisper-json";

/** As ferramentas que leem WAV 16 kHz mono (o whisper.cpp e o pyannote) recebem o áudio convertido numa pasta de trabalho. */
async function withWav<T>(run: CommandRunner, ffmpegBin: string, audio: AudioFile, workDir: string, signal: AbortSignal, use: (wav: string, folder: string) => Promise<T>): Promise<T> {
  await mkdir(workDir, { recursive: true });
  const folder = await mkdtemp(join(workDir, "job-"));
  try {
    const wav = join(folder, "audio.wav");
    await run(ffmpegBin, ["-y", "-loglevel", "error", "-i", audio.path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], { signal });
    return await use(wav, folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export interface WhisperOptions {
  ffmpegBin: string;
  bin: string;
  /** O modelo `ggml-large-v3-turbo-q5_0.bin` (comprimido). */
  model: string;
  extraArgs: string[];
  workDir: string;
}

/** O whisper.cpp (`whisper-cli`), compilado com Vulkan para usar a placa de vídeo. */
export class WhisperCpp implements Whisper {
  constructor(
    private readonly run: CommandRunner,
    private readonly options: WhisperOptions,
  ) {}

  transcribe(audio: AudioFile, language: string | null, signal: AbortSignal): Promise<TimedText[]> {
    const { ffmpegBin, bin, model, extraArgs, workDir } = this.options;
    return withWav(this.run, ffmpegBin, audio, workDir, signal, async (wav, folder) => {
      const output = join(folder, "out");
      await this.run(bin, ["-m", model, "-f", wav, "-l", baseLanguage(language), "-oj", "-of", output, "-np", ...extraArgs], { signal });
      return parseWhisperJson(JSON.parse(await readFile(`${output}.json`, "utf8")));
    });
  }
}

/** O whisper.cpp quer `pt`, não `pt-BR`; `auto` pede a detecção. */
const baseLanguage = (language: string | null) => language?.split(/[-_]/)[0]?.toLowerCase() || "auto";

export interface DiarizerOptions {
  ffmpegBin: string;
  /** O Python do ambiente com o pyannote. */
  python: string;
  /** `python/diarize.py`, deste app. */
  script: string;
  model: string;
  workDir: string;
}

/** O pyannote, no processador, pelo `python/diarize.py`. */
export class PyannoteDiarizer implements Diarizer {
  constructor(
    private readonly run: CommandRunner,
    private readonly options: DiarizerOptions,
  ) {}

  diarize(audio: AudioFile, signal: AbortSignal): Promise<SpeakerTurn[]> {
    const { ffmpegBin, python, script, model, workDir } = this.options;
    return withWav(this.run, ffmpegBin, audio, workDir, signal, async (wav) => {
      const { stdout } = await this.run(python, [script, wav, model], { signal, env: { CUDA_VISIBLE_DEVICES: "", PYTHONUNBUFFERED: "1" } });
      return parseDiarization(stdout);
    });
  }
}
