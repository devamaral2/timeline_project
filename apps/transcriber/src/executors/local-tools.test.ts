import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandRunner } from "./command-runner";
import { PyannoteDiarizer, WhisperCpp } from "./local-tools";

describe("whisper.cpp e pyannote de verdade (atrás de um executor de comandos falso)", () => {
  let work: string;
  let calls: { command: string; args: string[]; env?: Record<string, string> }[];
  let respond: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  const runner: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, env: options.env });
    return respond(command, args);
  };
  const signal = new AbortController().signal;
  const audio = { path: "/cache/abc123.webm", bytes: 1 };

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), "transcriber-work-"));
    calls = [];
    respond = async () => ({ stdout: "", stderr: "" });
  });
  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it("converte para WAV 16 kHz mono e roda o whisper-cli no modelo comprimido", async () => {
    respond = async (command, args) => {
      if (command === "whisper-cli") {
        const prefix = args[args.indexOf("-of") + 1] ?? "";
        await writeFile(`${prefix}.json`, JSON.stringify({ transcription: [{ offsets: { from: 0, to: 2000 }, text: " Olá" }] }));
      }
      return { stdout: "", stderr: "" };
    };
    const whisper = new WhisperCpp(runner, { ffmpegBin: "ffmpeg", bin: "whisper-cli", model: "/m/ggml-large-v3-turbo-q5_0.bin", extraArgs: ["-t", "8"], workDir: work });

    const texts = await whisper.transcribe(audio, "pt-BR", signal);

    expect(texts).toEqual([{ startSeconds: 0, endSeconds: 2, text: "Olá" }]);
    expect(calls.map((call) => call.command)).toEqual(["ffmpeg", "whisper-cli"]);
    expect(calls[0]?.args).toEqual(expect.arrayContaining(["-ar", "16000", "-ac", "1"]));
    const args = calls[1]?.args ?? [];
    expect(args[args.indexOf("-m") + 1]).toBe("/m/ggml-large-v3-turbo-q5_0.bin");
    expect(args[args.indexOf("-l") + 1]).toBe("pt");
    expect(args).toEqual(expect.arrayContaining(["-t", "8"]));
  });

  it("deixa o Whisper detectar o idioma quando o vídeo não o informa", async () => {
    respond = async (command, args) => {
      if (command === "whisper-cli") await writeFile(`${args[args.indexOf("-of") + 1]}.json`, JSON.stringify({ transcription: [] }));
      return { stdout: "", stderr: "" };
    };
    await new WhisperCpp(runner, { ffmpegBin: "ffmpeg", bin: "whisper-cli", model: "m", extraArgs: [], workDir: work }).transcribe(audio, null, signal);
    const args = calls[1]?.args ?? [];
    expect(args[args.indexOf("-l") + 1]).toBe("auto");
  });

  it("roda o pyannote só no processador e lê os turnos", async () => {
    respond = async (command) => ({ stdout: command === "/venv/bin/python" ? '[{"start":0,"end":3,"speaker":"SPEAKER_00"}]' : "", stderr: "" });
    const diarizer = new PyannoteDiarizer(runner, { ffmpegBin: "ffmpeg", python: "/venv/bin/python", script: "/app/diarize.py", model: "pyannote/speaker-diarization-3.1", workDir: work });

    const turns = await diarizer.diarize(audio, signal);

    expect(turns).toEqual([{ startSeconds: 0, endSeconds: 3, speaker: "SPEAKER_00" }]);
    expect(calls[1]?.env?.CUDA_VISIBLE_DEVICES).toBe("");
    expect(calls[1]?.args[0]).toBe("/app/diarize.py");
  });

  it("apaga a pasta de trabalho mesmo quando a ferramenta falha", async () => {
    respond = async (command) => {
      if (command === "whisper-cli") throw new Error("vulkan: dispositivo perdido");
      return { stdout: "", stderr: "" };
    };
    const whisper = new WhisperCpp(runner, { ffmpegBin: "ffmpeg", bin: "whisper-cli", model: "m", extraArgs: [], workDir: work });

    await expect(whisper.transcribe(audio, "pt", signal)).rejects.toThrow(/vulkan/);

    const { readdir } = await import("node:fs/promises");
    expect(await readdir(work)).toEqual([]);
  });
});
