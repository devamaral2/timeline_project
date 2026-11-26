import type { TranscriptionResult } from "@repo/contracts";
import { describe, expect, test } from "vitest";
import { InMemoryTranscriptionRequests } from "../../api-core/transcription/testing/in-memory-transcription-requests";
import {
  TRANSCRIPTION_DELIVERY_MAX_BYTES,
  TRANSCRIPTION_FORMAT_JOB,
  TRANSCRIPTION_LEASE_MS,
  TRANSCRIPTION_JOB,
  TRANSCRIPTION_MAX_ATTEMPTS,
} from "../../api-core/transcription/transcription-requests";
import { InMemoryTaskCardQuery } from "../../api-core/tasks/testing/in-memory-task-card.query";
import { InMemoryTaskRelations } from "../../api-core/tasks/testing/in-memory-task-relations";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { Task } from "../../domain";
import { RequestTranscriptionUseCase } from "../request-transcription/request-transcription.usecase";
import { DailyReadingGate } from "../save-daily-reading/daily-reading.gate";
import { TranscriptionWorkerUseCase } from "./transcription-worker.usecase";

const actor = { userId: "auth-user-1", permissions: ["transcription:work"] };
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const QUEUE_BODY = `Fonte: [YouTube](${VIDEO})\n\nTranscrição na fila\n`;

const RESULT: TranscriptionResult = {
  video: {
    title: "Entrevista longa",
    channel: "Canal",
    durationSeconds: 3600,
    description: "Links e créditos",
    chapters: [{ startSeconds: 0, title: "Abertura" }],
  },
  source: "whisper",
  segments: [
    { startSeconds: 0, endSeconds: 4.2, speaker: "Falante 1", text: "Bem-vindos ao programa." },
    { startSeconds: 4.2, endSeconds: 9, speaker: "Falante 2", text: "Obrigado pelo convite." },
  ],
  hotMoments: [{ startSeconds: 600, endSeconds: 660, score: 0.9 }],
  comments: [{ author: "ana", text: "Ótimo!", likes: 3, publishedAt: "2026-11-20T10:00:00Z" }],
};

/** O relógio anda só quando o teste manda: é assim que o lease vence. */
function setup() {
  let current = new Date("2026-08-17T15:00:00.000Z");
  const clock = () => current;
  const kit = createTasksKit({ clock });
  const requests = new InMemoryTranscriptionRequests(kit.database, clock);
  const gate = new DailyReadingGate(
    new InMemoryTaskCardQuery(kit.database),
    kit.artifactRepository,
    kit.artifactBuilder,
    kit.createTask,
    kit.batchWriter,
    undefined,
    clock,
  );
  return {
    ...kit,
    requests,
    request: new RequestTranscriptionUseCase(gate, requests, new InMemoryTaskRelations()),
    worker: new TranscriptionWorkerUseCase(gate, kit.batchWriter, requests, clock),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

const bodyOf = async (kit: ReturnType<typeof setup>, artifactId: string) =>
  ((await kit.artifactRepository.findById(artifactId))?.data as { body?: string } | undefined)?.body;

/** Um pedido já na fila, como a rota de pedido o deixa. */
async function queued(kit: ReturnType<typeof setup>, url = VIDEO, user = actor) {
  return kit.request.execute({ url }, user);
}

describe("reservar o próximo pedido", () => {
  test("com a fila vazia, não devolve nada", async () => {
    const kit = setup();

    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
  });

  test("devolve o pedido, o endereço canônico e o lease", async () => {
    const kit = setup();
    const { requestId } = await queued(kit, "https://youtu.be/dQw4w9WgXcQ?t=90");

    const reservation = await kit.worker.reserve(actor);

    expect(reservation).toMatchObject({ requestId, url: VIDEO });
    expect(reservation?.leaseToken).toBeTruthy();
    expect(reservation?.leaseExpiresAt).toBe(new Date(Date.parse("2026-08-17T15:00:00.000Z") + TRANSCRIPTION_LEASE_MS).toISOString());
  });

  test("entrega os pedidos do mais antigo ao mais novo, um por vez, enquanto o lease vale", async () => {
    const kit = setup();
    const first = await queued(kit);
    const second = await queued(kit, "https://www.youtube.com/shorts/abcdefghijk");

    expect((await kit.worker.reserve(actor))?.requestId).toBe(first.requestId);
    expect((await kit.worker.reserve(actor))?.requestId).toBe(second.requestId);
    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
  });

  test("só reserva pedido da própria pessoa", async () => {
    const kit = setup();
    await queued(kit, VIDEO, { userId: "auth-user-2", permissions: ["transcription:work"] });

    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
  });

  test("não reserva o pedido que já está sendo formatado", async () => {
    const kit = setup();
    await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    await kit.worker.deliver({ requestId: reservation.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, actor);
    kit.advance(TRANSCRIPTION_LEASE_MS * 2);

    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
  });

  test("o lease vencido devolve o pedido à fila, com outro lease; o lease velho perde o direito", async () => {
    const kit = setup();
    const { requestId } = await queued(kit);
    const lost = await kit.worker.reserve(actor);
    if (!lost) throw new Error("sem reserva");

    kit.advance(TRANSCRIPTION_LEASE_MS + 1);
    const again = await kit.worker.reserve(actor);

    expect(again).toMatchObject({ requestId, url: VIDEO });
    expect(again?.leaseToken).not.toBe(lost.leaseToken);
    await expect(kit.worker.renew({ requestId, leaseToken: lost.leaseToken, stage: "download", percent: 10 }, actor)).rejects.toThrow(/lease/i);
    await expect(
      kit.worker.deliver({ requestId, leaseToken: lost.leaseToken, outcome: "failed", code: "failed" }, actor),
    ).rejects.toThrow(/lease/i);
    expect(await kit.taskRepository.findById(requestId)).toMatchObject({ status: "awaiting_transcription" });
  });
});

describe("o teto de reservas do pedido", () => {
  /** O serviço reserva o pedido e some: o lease vence sem renovar nem entregar. */
  async function abandon(kit: ReturnType<typeof setup>, times: number) {
    for (let attempt = 0; attempt < times; attempt++) {
      const reservation = await kit.worker.reserve(actor);
      if (!reservation) throw new Error(`sem reserva na vez ${attempt + 1}`);
      kit.advance(TRANSCRIPTION_LEASE_MS + 1);
    }
  }

  test("o teto são cinco reservas", () => {
    expect(TRANSCRIPTION_MAX_ATTEMPTS).toBe(5);
  });

  test("com quatro leases vencidos, o pedido ainda volta à fila", async () => {
    const kit = setup();
    const { requestId } = await queued(kit);
    await abandon(kit, TRANSCRIPTION_MAX_ATTEMPTS - 1);

    expect((await kit.worker.reserve(actor))?.requestId).toBe(requestId);
    expect(await kit.taskRepository.findById(requestId)).toMatchObject({ status: "awaiting_transcription" });
  });

  test("com o quinto lease vencido, o pedido falha como numa entrega com falha: o documento diz o motivo e a leitura volta para a fazer", async () => {
    const kit = setup();
    const created = await queued(kit);
    const reading = await kit.taskRepository.findById(created.taskId);
    if (!reading) throw new Error("sem leitura");
    kit.database.tasks = kit.database.tasks.map((task) => (task.id === reading.id ? reading.revise({ status: "done", finishedAt: new Date() }) : task));
    await abandon(kit, TRANSCRIPTION_MAX_ATTEMPTS);

    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();

    const request = await kit.taskRepository.findById(created.requestId);
    expect(request).toMatchObject({ status: "failed", data: { failureCode: "failed" } });
    expect(request?.finishedAt).toBeInstanceOf(Date);
    expect(await bodyOf(kit, created.artifactId)).toContain("Transcrição indisponível: a transcrição falhou.");
    const revised = await kit.taskRepository.findById(created.taskId);
    expect(revised).toMatchObject({ status: "todo" });
    expect(revised?.finishedAt).toBeUndefined();
    expect(kit.requests.openJobs()).toEqual([]);
    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
  });

  test("o pedido com o quinto lease ainda valendo não falha", async () => {
    const kit = setup();
    const { requestId } = await queued(kit);
    await abandon(kit, TRANSCRIPTION_MAX_ATTEMPTS - 1);
    await kit.worker.reserve(actor);

    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
    expect(await kit.taskRepository.findById(requestId)).toMatchObject({ status: "awaiting_transcription" });
  });

  test("o pedido de outra pessoa não falha na reserva desta", async () => {
    const kit = setup();
    const other = { userId: "auth-user-2", permissions: ["transcription:work"] };
    const { requestId } = await queued(kit, VIDEO, other);
    for (let attempt = 0; attempt < TRANSCRIPTION_MAX_ATTEMPTS; attempt++) {
      await kit.worker.reserve(other);
      kit.advance(TRANSCRIPTION_LEASE_MS + 1);
    }

    await kit.worker.reserve(actor);

    expect(await kit.taskRepository.findById(requestId)).toMatchObject({ status: "awaiting_transcription" });
  });
});

describe("renovar o lease com o progresso", () => {
  test("estende o lease e guarda a etapa e a porcentagem", async () => {
    const kit = setup();
    const { requestId } = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");

    kit.advance(TRANSCRIPTION_LEASE_MS - 1000);
    const renewed = await kit.worker.renew({ requestId, leaseToken: reservation.leaseToken, stage: "transcription", percent: 42 }, actor);

    expect(Date.parse(renewed.leaseExpiresAt)).toBeGreaterThan(Date.parse(reservation.leaseExpiresAt));
    expect(kit.requests.progressOf(requestId)).toEqual({ stage: "transcription", percent: 42 });
    // O lease novo segura o pedido além do vencimento do primeiro.
    kit.advance(2000);
    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
  });

  test("recusa um token que não é o do lease", async () => {
    const kit = setup();
    const { requestId } = await queued(kit);
    await kit.worker.reserve(actor);

    await expect(kit.worker.renew({ requestId, leaseToken: "outro", stage: "download", percent: 1 }, actor)).rejects.toThrow(/lease/i);
  });

  test("recusa o pedido de outra pessoa", async () => {
    const kit = setup();
    const { requestId } = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");

    await expect(
      kit.worker.renew({ requestId, leaseToken: reservation.leaseToken, stage: "download", percent: 1 }, { userId: "auth-user-2" }),
    ).rejects.toThrow(/lease/i);
  });
});

describe("entregar a falha", () => {
  test.each([
    ["too_large", "grande demais"],
    ["private", "privado"],
    ["unavailable", "disponível"],
    ["no_audio", "áudio"],
    ["failed", "falhou"],
  ] as const)("com %s, o pedido vai para failed, o documento diz o motivo e a leitura volta para a fazer", async (code, reason) => {
    const kit = setup();
    const created = await queued(kit);
    const reading = await kit.taskRepository.findById(created.taskId);
    if (!reading) throw new Error("sem leitura");
    kit.database.tasks = kit.database.tasks.map((task) => (task.id === reading.id ? reading.revise({ status: "done", finishedAt: new Date() }) : task));
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");

    const result = await kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "failed", code }, actor);

    expect(result).toEqual({ requestId: created.requestId, status: "failed", code });
    const request = await kit.taskRepository.findById(created.requestId);
    expect(request).toMatchObject({ status: "failed", data: { failureCode: code } });
    expect(request?.finishedAt).toBeInstanceOf(Date);
    const body = await bodyOf(kit, created.artifactId);
    expect(body?.startsWith(`Fonte: [YouTube](${VIDEO})\n\nTranscrição indisponível: `)).toBe(true);
    expect(body).toContain(reason);
    expect(body).not.toContain("Transcrição na fila");
    const revised = await kit.taskRepository.findById(created.taskId);
    expect(revised).toMatchObject({ status: "todo" });
    expect(revised?.finishedAt).toBeUndefined();
    expect(kit.requests.openJobs()).toEqual([]);
  });

  test("com o documento do pedido apagado, a falha cria outro e o pedido passa a apontar para ele", async () => {
    const kit = setup();
    const created = await queued(kit);
    await kit.artifactRepository.delete(created.artifactId, actor.userId);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");

    await kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "failed", code: "private" }, actor);

    const request = await kit.taskRepository.findById(created.requestId);
    const { artifactId } = (request?.data ?? {}) as { artifactId: string };
    expect(artifactId).not.toBe(created.artifactId);
    expect(await bodyOf(kit, artifactId)).toContain("o vídeo é privado.");
    expect(kit.database.artifacts.map((artifact) => artifact.id)).toEqual([artifactId]);
  });

  test("a mesma entrega duas vezes não vale: o pedido já está encerrado", async () => {
    const kit = setup();
    const created = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    const delivery = { requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "failed", code: "private" } as const;
    await kit.worker.deliver(delivery, actor);

    await expect(kit.worker.deliver(delivery, actor)).rejects.toThrow(/lease/i);
  });
});

describe("entregar o resultado", () => {
  test("grava o resultado cru numa entrada, muda o pedido para running e enfileira a formatação, sem mexer no documento", async () => {
    const kit = setup();
    const created = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");

    const result = await kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, actor);

    expect(result).toEqual({ requestId: created.requestId, status: "running" });
    expect(await kit.taskRepository.findById(created.requestId)).toMatchObject({ status: "running" });
    expect(kit.requests.entriesOf(created.requestId)).toEqual([{ kind: "input", data: { type: "transcription", ...RESULT } }]);
    expect(kit.requests.formatJobs).toEqual([{ kind: TRANSCRIPTION_FORMAT_JOB, userId: actor.userId, taskId: created.requestId }]);
    expect(kit.requests.openJobs()).toEqual([]);
    expect(await bodyOf(kit, created.artifactId)).toBe(QUEUE_BODY);
  });

  test("o job do serviço local sai da fila: o lease vencido depois não o devolve", async () => {
    const kit = setup();
    const created = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    await kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, actor);

    kit.advance(TRANSCRIPTION_LEASE_MS * 3);

    await expect(kit.worker.reserve(actor)).resolves.toBeUndefined();
    expect(kit.requests.jobs.filter((job) => job.kind === TRANSCRIPTION_JOB)).toHaveLength(1);
  });

  test("acima do teto de tamanho, recusa: o pedido fica failed com too_large e o documento diz por quê", async () => {
    const kit = setup();
    const created = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    const huge = { ...RESULT, segments: [{ startSeconds: 0, endSeconds: 1, speaker: "Falante 1", text: "a".repeat(TRANSCRIPTION_DELIVERY_MAX_BYTES) }] };

    const result = await kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: huge }, actor);

    expect(result).toEqual({ requestId: created.requestId, status: "failed", code: "too_large" });
    expect(await kit.taskRepository.findById(created.requestId)).toMatchObject({ status: "failed", data: { failureCode: "too_large" } });
    expect(await bodyOf(kit, created.artifactId)).toContain("grande demais");
    expect(kit.requests.entriesOf(created.requestId)).toEqual([]);
    expect(kit.requests.formatJobs).toEqual([]);
  });

  test("com o lease perdido ou de outra pessoa, não grava nada", async () => {
    const kit = setup();
    const created = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    const commits = kit.batchWriter.commits.length;

    await expect(
      kit.worker.deliver({ requestId: created.requestId, leaseToken: "outro", outcome: "completed", result: RESULT }, actor),
    ).rejects.toThrow(/lease/i);
    await expect(
      kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, { userId: "auth-user-2" }),
    ).rejects.toThrow(/lease/i);

    expect(kit.batchWriter.commits).toHaveLength(commits);
    expect(await kit.taskRepository.findById(created.requestId)).toMatchObject({ status: "awaiting_transcription" });
    expect(kit.requests.entriesOf(created.requestId)).toEqual([]);
  });

  test("um pedido cancelado antes da entrega não é reaberto", async () => {
    const kit = setup();
    const created = await queued(kit);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    const request = await kit.taskRepository.findById(created.requestId);
    if (!request) throw new Error("sem pedido");
    kit.database.tasks = kit.database.tasks.map((task) =>
      task.id === request.id ? Task.rehydrate({ ...request, status: "cancel", notifyOffsetsMinutes: [], tags: [], data: { ...request.data }, artifactLinks: [...request.artifactLinks], subtaskIds: [] }) : task,
    );

    await expect(
      kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, actor),
    ).rejects.toThrow(/lease/i);
    expect(await kit.taskRepository.findById(created.requestId)).toMatchObject({ status: "cancel" });
  });
});
