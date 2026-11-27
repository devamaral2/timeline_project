import { rm } from "node:fs/promises";
import { join } from "node:path";
import { HttpWorkerApi } from "./api/http-worker-api";
import { AudioCache } from "./cache/audio-cache";
import { ConfigError, loadConfig } from "./config";
import { runCommand } from "./executors/command-runner";
import { PyannoteDiarizer, WhisperCpp } from "./executors/local-tools";
import { RealYtDlp } from "./executors/ytdlp";
import { createLogger } from "./logger";
import { TranscriberService } from "./service";

const log = createLogger();

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const workDir = join(config.cacheDir, "work");
  // O que sobrou de um trabalho interrompido (WAV temporário) não vale nada.
  await rm(workDir, { recursive: true, force: true });

  const service = new TranscriberService({
    api: new HttpWorkerApi(config.apiUrl, config.deviceKey),
    ytdlp: new RealYtDlp(runCommand, { bin: config.ytdlpBin, updateCommand: config.ytdlpUpdate, extraArgs: config.ytdlpExtraArgs }),
    whisper: new WhisperCpp(runCommand, {
      ffmpegBin: config.ffmpegBin,
      bin: config.whisperBin,
      model: config.whisperModel,
      extraArgs: config.whisperExtraArgs,
      workDir,
    }),
    diarizer: new PyannoteDiarizer(runCommand, {
      ffmpegBin: config.ffmpegBin,
      python: config.diarizePython,
      script: join(__dirname, "..", "python", "diarize.py"),
      model: config.diarizeModel,
      workDir,
    }),
    cache: new AudioCache(config.cacheDir, config.cacheTtlMs),
    log,
    config: config.service,
    now: () => new Date(),
    sleep,
  });

  // SIGTERM (systemd parando, logout) e Ctrl+C: o pedido em andamento é largado, e o lease vencido o devolve à fila.
  const shutdown = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      log.info(`recebi ${signal}, parando`);
      shutdown.abort();
    });
  }

  log.info(`buscando pedidos em ${config.apiUrl} (um por vez, a cada ${config.service.pollMs / 1000} s quando a fila está vazia)`);
  await service.run(shutdown.signal);
}

main().catch((cause) => {
  if (cause instanceof ConfigError) {
    log.error(cause.message);
    process.exit(78);
  }
  log.error(`o serviço caiu: ${cause instanceof Error ? (cause.stack ?? cause.message) : cause}`);
  process.exit(1);
});
