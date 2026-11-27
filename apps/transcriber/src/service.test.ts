import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AudioCache } from "./cache/audio-cache";
import { silentLogger } from "./logger";
import { DeliveryTooLargeError, LeaseLostError, WorkerAuthError } from "./ports";
import { TranscriberService } from "./service";
import { FakeAudioStore, FakeDiarizer, FakeWhisper, FakeWorkerApi, FakeYtDlp, reservation, video } from "./testing/fakes";

const DAY = 24 * 3600 * 1000;

describe("serviço local", () => {
  let api: FakeWorkerApi;
  let ytdlp: FakeYtDlp;
  let whisper: FakeWhisper;
  let sleeps: number[];
  let clock: Date;
  let cleanups: Date[];
  let shutdown: AbortController;

  const service = (overrides: Partial<ConstructorParameters<typeof TranscriberService>[0]> = {}) =>
    new TranscriberService({
      api,
      ytdlp,
      whisper,
      diarizer: new FakeDiarizer(),
      cache: Object.assign(new FakeAudioStore(), {
        cleanup: async (now: Date) => {
          cleanups.push(now);
          return [];
        },
      }),
      log: silentLogger(),
      config: {
        limits: { maxDurationSeconds: 4 * 3600, maxAudioBytes: 500 * 1024 * 1024 },
        pollMs: 30_000,
        maxBackoffMs: 300_000,
        leaseRenewMs: 60_000,
        cleanupIntervalMs: DAY,
        deliveryRetryDelaysMs: [1, 2],
      },
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      ...overrides,
    });

  beforeEach(() => {
    api = new FakeWorkerApi();
    ytdlp = new FakeYtDlp();
    whisper = new FakeWhisper();
    sleeps = [];
    cleanups = [];
    clock = new Date("2026-11-26T12:00:00Z");
    shutdown = new AbortController();
  });

  describe("ao subir", () => {
    it("atualiza o yt-dlp e limpa o cache", async () => {
      await service().startup(shutdown.signal);
      expect(ytdlp.calls).toEqual(["update"]);
      expect(cleanups).toHaveLength(1);
    });

    it("segue quando a atualização do yt-dlp falha", async () => {
      ytdlp.updateError = new Error("instalado pelo gerenciador de pacotes");
      await expect(service().startup(shutdown.signal)).resolves.toBeUndefined();
      expect(cleanups).toHaveLength(1);
    });
  });

  describe("busca de pedidos", () => {
    it("com a fila vazia, espera o intervalo e não faz mais nada", async () => {
      expect(await service().runOnce(shutdown.signal)).toBe("idle");
      expect(api.deliveries).toEqual([]);
    });

    it("um pedido por vez: reserva, processa e entrega com o lease do pedido", async () => {
      api.queue.push(reservation("req-1"), reservation("req-2"));

      expect(await service().runOnce(shutdown.signal)).toBe("handled");

      expect(api.queue.map((item) => item.requestId)).toEqual(["req-2"]);
      expect(api.deliveries).toHaveLength(1);
      expect(api.deliveries[0]).toMatchObject({ requestId: "req-1", leaseToken: "lease-1", outcome: "completed" });
    });

    it("renova o lease a cada etapa, com o progresso", async () => {
      api.queue.push(reservation());
      await service().runOnce(shutdown.signal);
      expect(api.renewals.map((renewal) => renewal.stage)).toEqual(["metadata", "download", "transcription", "speakers", "comments"]);
      expect(api.renewals.every((renewal) => renewal.requestId === "req-1" && renewal.leaseToken === "lease-1")).toBe(true);
    });

    it("a falha do pedido é entregue com o código, sem a mensagem do yt-dlp", async () => {
      api.queue.push(reservation());
      ytdlp.meta = new Error("ERROR: [youtube] abc123: Private video");

      await service().runOnce(shutdown.signal);

      expect(api.deliveries).toEqual([{ requestId: "req-1", leaseToken: "lease-1", outcome: "failed", code: "private" }]);
    });

    it("um vídeo maior que o teto é entregue como too_large sem baixar", async () => {
      api.queue.push(reservation());
      ytdlp.meta = video({ durationSeconds: 5 * 3600 });

      await service().runOnce(shutdown.signal);

      expect(api.deliveries[0]).toMatchObject({ outcome: "failed", code: "too_large" });
      expect(ytdlp.calls).not.toContain("downloadAudio");
    });

    it("falha ao buscar (rede fora, chave recusada) não derruba o serviço", async () => {
      api.nextError = new Error("ECONNREFUSED");
      expect(await service().runOnce(shutdown.signal)).toBe("error");
      api.nextError = new WorkerAuthError(401);
      expect(await service().runOnce(shutdown.signal)).toBe("error");
    });
  });

  describe("o pedido volta à fila", () => {
    it("lease perdido no meio do trabalho: para e não entrega nada", async () => {
      api.queue.push(reservation());
      api.renewError = new LeaseLostError();

      expect(await service().runOnce(shutdown.signal)).toBe("handled");

      expect(api.deliveries).toEqual([]);
      expect(whisper.calls).toEqual([]);
    });

    it("serviço desligado no meio do trabalho: não entrega nem falha, o lease vence e o pedido volta", async () => {
      api.queue.push(reservation());
      whisper.transcribe = async () => {
        shutdown.abort();
        throw new Error("morto");
      };

      await service().runOnce(shutdown.signal);

      expect(api.deliveries).toEqual([]);
    });

    it("lease perdido na entrega: nada mais a fazer", async () => {
      api.queue.push(reservation());
      api.deliverErrors = [new LeaseLostError()];

      await service().runOnce(shutdown.signal);

      expect(api.deliveries).toEqual([]);
    });
  });

  describe("entrega", () => {
    it("tenta de novo quando a rede falha e entrega na segunda", async () => {
      api.queue.push(reservation());
      api.deliverErrors = [new Error("ECONNRESET")];

      await service().runOnce(shutdown.signal);

      expect(api.deliveries).toHaveLength(1);
      expect(sleeps).toEqual([1]);
    });

    it("sem conseguir entregar, desiste e o pedido volta à fila quando o lease vence", async () => {
      api.queue.push(reservation());
      api.deliverErrors = [new Error("a"), new Error("b"), new Error("c")];

      expect(await service().runOnce(shutdown.signal)).toBe("handled");

      expect(api.deliveries).toEqual([]);
    });

    it("corpo grande demais para o gateway (413) vira a falha too_large", async () => {
      api.queue.push(reservation());
      api.deliverErrors = [new DeliveryTooLargeError()];

      await service().runOnce(shutdown.signal);

      expect(api.deliveries).toEqual([{ requestId: "req-1", leaseToken: "lease-1", outcome: "failed", code: "too_large" }]);
    });

    it("chave recusada na entrega não é repetida", async () => {
      api.queue.push(reservation());
      api.deliverErrors = [new WorkerAuthError(403)];

      await service().runOnce(shutdown.signal);

      expect(api.deliveries).toEqual([]);
      expect(sleeps).toEqual([]);
    });
  });

  describe("repetição", () => {
    it("limpa o cache uma vez por dia, entre dois pedidos", async () => {
      const running = service();
      await running.startup(shutdown.signal);
      expect(cleanups).toHaveLength(1);

      clock = new Date(clock.getTime() + DAY - 1);
      await running.runOnce(shutdown.signal);
      expect(cleanups).toHaveLength(1);

      clock = new Date(clock.getTime() + 1);
      await running.runOnce(shutdown.signal);
      expect(cleanups).toHaveLength(2);
    });

    it("espera o intervalo quando ocioso", async () => {
      const running = service({
        sleep: async (ms) => {
          sleeps.push(ms);
          if (sleeps.length === 2) shutdown.abort();
        },
      });
      await running.run(shutdown.signal);
      expect(sleeps).toEqual([30_000, 30_000]);
    });

    it("recua, até um teto, quando a busca falha", async () => {
      api.nextError = new Error("fora do ar");
      const running = service({
        sleep: async (ms) => {
          sleeps.push(ms);
          if (sleeps.length === 6) shutdown.abort();
        },
      });
      await running.run(shutdown.signal);
      expect(sleeps).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
    });
  });
});

describe("limpeza real do cache ao subir", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "transcriber-svc-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("apaga o áudio velho e guarda o novo", async () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const old = join(dir, "velho.webm");
    await writeFile(old, "x");
    await utimes(old, new Date(now.getTime() - 8 * DAY), new Date(now.getTime() - 8 * DAY));
    await writeFile(join(dir, "novo.webm"), "y");

    const cache = new AudioCache(dir, 7 * DAY);
    const svc = new TranscriberService({
      api: new FakeWorkerApi(),
      ytdlp: new FakeYtDlp(),
      whisper: new FakeWhisper(),
      diarizer: new FakeDiarizer(),
      cache,
      log: silentLogger(),
      config: {
        limits: { maxDurationSeconds: 1, maxAudioBytes: 1 },
        pollMs: 1,
        maxBackoffMs: 1,
        leaseRenewMs: 1000,
        cleanupIntervalMs: DAY,
        deliveryRetryDelaysMs: [],
      },
      now: () => now,
      sleep: async () => {},
    });

    await svc.startup(new AbortController().signal);

    expect(await cache.find("velho")).toBeNull();
    expect(await cache.find("novo")).not.toBeNull();
  });
});
