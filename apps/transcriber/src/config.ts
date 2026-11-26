import { homedir } from "node:os";
import { join } from "node:path";
import { DEVICE_KEY_PREFIX } from "@repo/contracts/device-key";
import type { ServiceConfig } from "./service";

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(`configuração inválida:\n- ${problems.join("\n- ")}`);
    this.name = "ConfigError";
  }
}

export interface Config {
  apiUrl: string;
  /** Nunca vai para o log. */
  deviceKey: string;
  service: ServiceConfig;
  cacheDir: string;
  cacheTtlMs: number;
  ytdlpBin: string;
  /** O comando que atualiza o yt-dlp ao subir, já em palavras. */
  ytdlpUpdate: string[];
  /** Argumentos a mais para todo yt-dlp (por exemplo `--cookies-from-browser firefox`). */
  ytdlpExtraArgs: string[];
  ffmpegBin: string;
  whisperBin: string;
  whisperModel: string;
  whisperExtraArgs: string[];
  /** O Python do ambiente onde o pyannote está instalado. */
  diarizePython: string;
  diarizeModel: string;
}

type Env = Record<string, string | undefined>;

const DAY_MS = 24 * 3600 * 1000;
const words = (value: string | undefined, fallback: string[]) => (value?.trim() ? value.trim().split(/\s+/) : fallback);

/** Lê a configuração do ambiente (que o carregador do 1Password e o systemd preenchem). */
export function loadConfig(env: Env): Config {
  const problems: string[] = [];

  const positive = (name: string, fallback: number): number => {
    const raw = env[name];
    if (raw === undefined || raw === "") return fallback;
    const value = Number(raw);
    if (!(value > 0) || !Number.isFinite(value)) {
      problems.push(`${name} deve ser um número maior que zero`);
      return fallback;
    }
    return value;
  };

  const apiUrl = (env.TRANSCRIBER_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!apiUrl) problems.push("TRANSCRIBER_API_URL não está definida (o endereço público do gateway, ex.: https://auth.seudominio)");
  else if (!/^https?:\/\//.test(apiUrl)) problems.push("TRANSCRIBER_API_URL deve começar com http:// ou https://");

  const deviceKey = (env.TRANSCRIBER_DEVICE_KEY ?? "").trim();
  if (!deviceKey) problems.push("TRANSCRIBER_DEVICE_KEY não está definida (a chave de dispositivo, no 1Password)");
  else if (!deviceKey.startsWith(DEVICE_KEY_PREFIX)) {
    problems.push(`TRANSCRIBER_DEVICE_KEY não parece uma chave de dispositivo (deveria começar com ${DEVICE_KEY_PREFIX})`);
  }

  const maxDurationSeconds = Math.round(positive("TRANSCRIBER_MAX_DURATION_HOURS", 4) * 3600);
  const maxAudioBytes = Math.round(positive("TRANSCRIBER_MAX_AUDIO_MB", 500) * 1024 * 1024);
  const cacheTtlMs = Math.round(positive("TRANSCRIBER_CACHE_DAYS", 7) * DAY_MS);
  const pollMs = Math.round(positive("TRANSCRIBER_POLL_SECONDS", 30) * 1000);

  if (problems.length > 0) throw new ConfigError(problems);

  const home = env.HOME ?? homedir();
  const cacheDir = env.TRANSCRIBER_CACHE_DIR || join(env.XDG_CACHE_HOME || join(home, ".cache"), "braid-transcriber");
  const dataDir = join(env.XDG_DATA_HOME || join(home, ".local", "share"), "braid-transcriber");

  return {
    apiUrl,
    deviceKey,
    service: {
      limits: { maxDurationSeconds, maxAudioBytes },
      pollMs,
      maxBackoffMs: 5 * 60 * 1000,
      leaseRenewMs: 60 * 1000,
      cleanupIntervalMs: DAY_MS,
      deliveryRetryDelaysMs: [5_000, 20_000, 60_000],
    },
    cacheDir,
    cacheTtlMs,
    ytdlpBin: env.TRANSCRIBER_YTDLP_BIN || "yt-dlp",
    ytdlpUpdate: words(env.TRANSCRIBER_YTDLP_UPDATE, ["yt-dlp", "-U"]),
    ytdlpExtraArgs: words(env.TRANSCRIBER_YTDLP_ARGS, []),
    ffmpegBin: env.TRANSCRIBER_FFMPEG_BIN || "ffmpeg",
    whisperBin: env.TRANSCRIBER_WHISPER_BIN || "whisper-cli",
    whisperModel: env.TRANSCRIBER_WHISPER_MODEL || join(dataDir, "models", "ggml-large-v3-turbo-q5_0.bin"),
    whisperExtraArgs: words(env.TRANSCRIBER_WHISPER_ARGS, []),
    diarizePython: env.TRANSCRIBER_DIARIZE_PYTHON || join(dataDir, "venv", "bin", "python"),
    diarizeModel: env.TRANSCRIBER_DIARIZE_MODEL || "pyannote/speaker-diarization-3.1",
  };
}
