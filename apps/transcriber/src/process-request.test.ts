import type { TranscriptionStage } from "@repo/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "./logger";
import { type ProcessDeps, processRequest } from "./process-request";
import { FakeAudioStore, FakeDiarizer, FakeWhisper, FakeYtDlp, RequestFailure, VIDEO_URL, video } from "./testing/fakes";
import { SUBTITLES_VTT } from "./testing/fakes";

const HOUR = 3600;
const MB = 1024 * 1024;

describe("processar um pedido", () => {
  let ytdlp: FakeYtDlp;
  let whisper: FakeWhisper;
  let diarizer: FakeDiarizer;
  let audio: FakeAudioStore;
  let progress: [TranscriptionStage, number][];
  let controller: AbortController;

  const deps = (): ProcessDeps => ({
    ytdlp,
    whisper,
    diarizer,
    audio,
    log: silentLogger(),
    limits: { maxDurationSeconds: 4 * HOUR, maxAudioBytes: 500 * MB },
    report: async (stage, percent) => {
      progress.push([stage, percent]);
    },
    now: () => new Date("2026-11-26T12:00:00Z"),
  });
  const run = () => processRequest(VIDEO_URL, deps(), controller.signal);

  beforeEach(() => {
    ytdlp = new FakeYtDlp();
    whisper = new FakeWhisper();
    diarizer = new FakeDiarizer();
    audio = new FakeAudioStore();
    progress = [];
    controller = new AbortController();
  });

  describe("o texto: legenda de alguém ou Whisper", () => {
    it("usa a legenda feita por alguém no idioma do vídeo e não chama o Whisper", async () => {
      ytdlp.meta = video({ humanSubtitles: [{ language: "pt" }] });

      const outcome = await run();

      expect(outcome.kind).toBe("completed");
      if (outcome.kind !== "completed") return;
      expect(outcome.result.source).toBe("subtitles");
      expect(outcome.result.segments.map((segment) => segment.text)).toEqual(["Bem-vindos ao programa.", "Hoje falamos de café."]);
      expect(whisper.calls).toEqual([]);
    });

    it("transcreve com o Whisper, no idioma do vídeo, quando não há legenda de alguém", async () => {
      const outcome = await run();

      expect(outcome.kind).toBe("completed");
      if (outcome.kind !== "completed") return;
      expect(outcome.result.source).toBe("whisper");
      expect(whisper.calls).toEqual([{ language: "pt" }]);
      expect(ytdlp.calls).not.toContain("downloadSubtitles");
    });

    it("cai no Whisper quando a legenda não pôde ser baixada ou veio sem falas", async () => {
      ytdlp.meta = video({ humanSubtitles: [{ language: "pt" }] });
      ytdlp.vtt = "WEBVTT\n";

      const outcome = await run();

      expect(outcome.kind === "completed" && outcome.result.source).toBe("whisper");
      expect(whisper.calls).toHaveLength(1);
    });

    it("um vídeo sem nenhuma fala falha com no_audio", async () => {
      whisper.texts = [];
      const outcome = await run();
      expect(outcome).toMatchObject({ kind: "failed", code: "no_audio" });
    });
  });

  describe("recusas antes de transcrever", () => {
    it("recusa o vídeo acima da duração, antes de baixar qualquer coisa", async () => {
      ytdlp.meta = video({ durationSeconds: 4 * HOUR + 1 });

      expect(await run()).toMatchObject({ kind: "failed", code: "too_large" });
      expect(ytdlp.calls).toEqual(["metadata"]);
    });

    it("aceita o vídeo exatamente no limite de duração", async () => {
      ytdlp.meta = video({ durationSeconds: 4 * HOUR });
      expect((await run()).kind).toBe("completed");
    });

    it("recusa, sem baixar, o áudio que o YouTube já diz ser maior que o teto", async () => {
      ytdlp.meta = video({ audioBytesEstimate: 500 * MB + 1 });

      expect(await run()).toMatchObject({ kind: "failed", code: "too_large" });
      expect(ytdlp.calls).not.toContain("downloadAudio");
    });

    it("recusa o áudio que passou do teto na baixada", async () => {
      ytdlp.audio = new RequestFailure("too_large", "passou do teto");
      expect(await run()).toMatchObject({ kind: "failed", code: "too_large" });
    });

    it("recusa o arquivo baixado que passou do teto mesmo sem o yt-dlp avisar", async () => {
      ytdlp.audio = { path: "/cache/abc123.webm", bytes: 500 * MB + 1 };
      expect(await run()).toMatchObject({ kind: "failed", code: "too_large" });
    });

    it("não baixa de novo o áudio que já está no cache", async () => {
      audio.cached.set("abc123", { path: "/cache/abc123.webm", bytes: 1_000_000 });

      expect((await run()).kind).toBe("completed");
      expect(ytdlp.calls).not.toContain("downloadAudio");
    });
  });

  describe("falantes, picos e comentários", () => {
    it("casa as falas com os falantes e rotula na ordem em que aparecem", async () => {
      diarizer.turns = [
        { startSeconds: 0, endSeconds: 5, speaker: "SPEAKER_07" },
        { startSeconds: 5, endSeconds: 10, speaker: "SPEAKER_02" },
      ];

      const outcome = await run();

      expect(outcome.kind === "completed" && outcome.result.segments.map((segment) => segment.speaker)).toEqual(["Falante 1", "Falante 2"]);
    });

    it("sem separar os falantes, entrega tudo como Falante 1 e não falha", async () => {
      diarizer.turns = new Error("pyannote não instalado");

      const outcome = await run();

      expect(outcome.kind === "completed" && outcome.result.segments.every((segment) => segment.speaker === "Falante 1")).toBe(true);
    });

    it("recolhe os picos do gráfico de mais assistidos, sem o começo", async () => {
      ytdlp.meta = video({
        durationSeconds: 1000,
        heatmap: [
          { startSeconds: 0, endSeconds: 10, value: 1 },
          { startSeconds: 500, endSeconds: 510, value: 0.8 },
        ],
      });

      const outcome = await run();

      expect(outcome.kind === "completed" && outcome.result.hotMoments).toEqual([{ startSeconds: 500, endSeconds: 510, score: 0.8 }]);
    });

    it("entrega os 50 comentários mais recentes", async () => {
      ytdlp.commentList = Array.from({ length: 70 }, (_, index) => ({
        author: `a${index}`,
        text: `c${index}`,
        likes: 1,
        timestamp: 1_000 + index,
        isReply: false,
      }));

      const outcome = await run();

      expect(outcome.kind === "completed" && outcome.result.comments).toHaveLength(50);
      expect(outcome.kind === "completed" && outcome.result.comments[0]?.text).toBe("c69");
    });

    it("comentários desligados ou com falha não derrubam a transcrição", async () => {
      ytdlp.commentList = new Error("comentários desligados");

      const outcome = await run();

      expect(outcome.kind === "completed" && outcome.result.comments).toEqual([]);
    });
  });

  it("entrega os dados do vídeo como a API os espera", async () => {
    const outcome = await run();

    expect(outcome.kind === "completed" && outcome.result.video).toEqual({
      title: "Conversa sobre café",
      channel: "Canal do Café",
      durationSeconds: 1000,
      description: "Descrição do vídeo",
      chapters: [{ startSeconds: 0, title: "Abertura" }],
    });
  });

  it("informa a etapa e a porcentagem em ordem", async () => {
    ytdlp.meta = video({ humanSubtitles: [{ language: "pt" }] });
    ytdlp.vtt = SUBTITLES_VTT;
    await run();

    expect(progress.map(([stage]) => stage)).toEqual(["metadata", "download", "transcription", "speakers", "comments"]);
    const percents = progress.map(([, percent]) => percent);
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
    expect(percents.every((percent) => percent >= 0 && percent <= 100)).toBe(true);
  });

  describe("falhas", () => {
    it.each([
      ["Private video", "private"],
      ["Video unavailable", "unavailable"],
      ["algo imprevisto", "failed"],
    ])("a falha do yt-dlp '%s' vira o código %s, sem a mensagem crua", async (message, code) => {
      ytdlp.meta = new Error(message);

      const outcome = await run();

      expect(outcome).toMatchObject({ kind: "failed", code });
      expect(JSON.stringify({ code: (outcome as { code: string }).code })).not.toContain(message);
    });

    it("uma falha do Whisper termina o pedido com failed", async () => {
      whisper.texts = new Error("vulkan: dispositivo perdido");
      expect(await run()).toMatchObject({ kind: "failed", code: "failed" });
    });
  });

  describe("interrupção: o pedido volta à fila", () => {
    it("desligado no meio, o trabalho é abandonado, sem entregar resultado nem falha", async () => {
      whisper.transcribe = async () => {
        controller.abort();
        throw new Error("interrompido");
      };

      expect(await run()).toEqual({ kind: "abandoned" });
    });

    it("já abortado antes de começar, não toca em nenhuma ferramenta", async () => {
      controller.abort();

      expect(await run()).toEqual({ kind: "abandoned" });
      expect(ytdlp.calls).toEqual([]);
    });
  });
});
