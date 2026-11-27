import type { TranscriptionResult } from "@repo/contracts";
import { describe, expect, test, vi } from "vitest";
import { InMemoryTranscriptionRequests } from "../../api-core/transcription/testing/in-memory-transcription-requests";
import { InMemoryTaskCardQuery } from "../../api-core/tasks/testing/in-memory-task-card.query";
import { InMemoryTaskRelations } from "../../api-core/tasks/testing/in-memory-task-relations";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { DailyReadingGate } from "../../api-core/tasks/daily-reading.gate";
import { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import { CancelTranscriptionUseCase, TRANSCRIPTION_CANCELLED_TEXT } from "./cancel-transcription.usecase";
import { RequestTranscriptionUseCase } from "./request-transcription.usecase";

const actor = { userId: "auth-user-1", permissions: ["transcription:work"] };
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const RESULT: TranscriptionResult = {
  video: { title: "Entrevista", channel: "Canal", durationSeconds: 60, description: "", chapters: [] },
  source: "whisper",
  segments: [{ startSeconds: 0, endSeconds: 4, speaker: "Falante 1", text: "Olá." }],
  hotMoments: [],
  comments: [],
};

function setup() {
  const clock = () => new Date("2026-08-17T15:00:00.000Z");
  const kit = createTasksKit({ clock });
  const requests = new InMemoryTranscriptionRequests(kit.database, clock);
  const gate = new DailyReadingGate(
    new InMemoryTaskCardQuery(kit.database), kit.artifactRepository, kit.artifactBuilder, kit.createTask, kit.batchWriter, undefined, clock,
  );
  const cancelOfTasks = vi.fn(async () => {});
  return {
    ...kit,
    requests,
    cancelOfTasks,
    request: new RequestTranscriptionUseCase(gate, requests, new InMemoryTaskRelations()),
    worker: new TranscriptionWorkerUseCase(gate, kit.batchWriter, requests, clock),
    cancel: new CancelTranscriptionUseCase(gate, requests, { cancelOfTasks }, clock),
  };
}

const bodyOf = async (kit: ReturnType<typeof setup>, artifactId: string) =>
  ((await kit.artifactRepository.findById(artifactId))?.data as { body?: string } | undefined)?.body;

/** A leitura do dia concluída pela pessoa: cancelar o pedido devolve o que havia para ler. */
async function finishReading(kit: ReturnType<typeof setup>, readingId: string) {
  const reading = await kit.taskRepository.findById(readingId);
  if (!reading) throw new Error("sem leitura");
  kit.database.tasks = kit.database.tasks.map((task) => (task.id === readingId ? reading.revise({ status: "done", finishedAt: new Date() }) : task));
}

describe("cancelar o pedido de transcrição", () => {
  test("esperando o serviço local: o pedido é cancelado, o job some, o documento diz que foi cancelado e a leitura volta para a fazer", async () => {
    const kit = setup();
    const created = await kit.request.execute({ url: VIDEO }, actor);
    await finishReading(kit, created.taskId);

    await expect(kit.cancel.execute(created.requestId, actor)).resolves.toBe(true);

    const request = await kit.taskRepository.findById(created.requestId);
    expect(request).toMatchObject({ status: "cancelled", data: { errorCode: "cancelled" } });
    expect(request?.finishedAt).toBeInstanceOf(Date);
    expect(await bodyOf(kit, created.artifactId)).toBe(`Fonte: [YouTube](${VIDEO})\n\n${TRANSCRIPTION_CANCELLED_TEXT}\n`);
    expect(TRANSCRIPTION_CANCELLED_TEXT).toBe("Transcrição cancelada");
    const reading = await kit.taskRepository.findById(created.taskId);
    expect(reading).toMatchObject({ status: "todo" });
    expect(reading?.finishedAt).toBeUndefined();
    expect(kit.requests.openJobs()).toEqual([]);
    expect(kit.cancelOfTasks).toHaveBeenCalledWith([created.requestId], actor.userId);
  });

  test("o serviço local já reservou o pedido: a entrega dele não vale mais", async () => {
    const kit = setup();
    const created = await kit.request.execute({ url: VIDEO }, actor);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");

    await kit.cancel.execute(created.requestId, actor);

    await expect(
      kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, actor),
    ).rejects.toThrow(/lease/i);
    await expect(
      kit.worker.renew({ requestId: created.requestId, leaseToken: reservation.leaseToken, stage: "download", percent: 5 }, actor),
    ).rejects.toThrow(/lease/i);
    expect(await kit.taskRepository.findById(created.requestId)).toMatchObject({ status: "cancelled" });
  });

  test("já entregue e esperando a formatação (running): fica interrupted, como todo pedido que já trabalhava", async () => {
    const kit = setup();
    const created = await kit.request.execute({ url: VIDEO }, actor);
    const reservation = await kit.worker.reserve(actor);
    if (!reservation) throw new Error("sem reserva");
    await kit.worker.deliver({ requestId: created.requestId, leaseToken: reservation.leaseToken, outcome: "completed", result: RESULT }, actor);

    await expect(kit.cancel.execute(created.requestId, actor)).resolves.toBe(true);

    expect(await kit.taskRepository.findById(created.requestId)).toMatchObject({ status: "interrupted", data: { errorCode: "cancelled" } });
    expect(await bodyOf(kit, created.artifactId)).toContain(TRANSCRIPTION_CANCELLED_TEXT);
    expect(await kit.requests.awaitingFormat(actor.userId, created.requestId)).toBeUndefined();
  });

  test("pedido que já terminou ou é de outra pessoa não muda nada", async () => {
    const kit = setup();
    const created = await kit.request.execute({ url: VIDEO }, actor);
    const commits = kit.batchWriter.commits.length;

    await expect(kit.cancel.execute(created.requestId, { userId: "auth-user-2" })).resolves.toBe(false);
    expect(kit.batchWriter.commits).toHaveLength(commits);
    expect(await kit.taskRepository.findById(created.requestId)).toMatchObject({ status: "awaiting_transcription" });

    await kit.cancel.execute(created.requestId, actor);
    const afterCancel = kit.batchWriter.commits.length;
    await expect(kit.cancel.execute(created.requestId, actor)).resolves.toBe(false);
    expect(kit.batchWriter.commits).toHaveLength(afterCancel);
  });

  test("depois de cancelado, o mesmo vídeo no mesmo dia nasce de novo e atualiza o mesmo documento", async () => {
    const kit = setup();
    const created = await kit.request.execute({ url: VIDEO }, actor);
    await kit.cancel.execute(created.requestId, actor);

    const again = await kit.request.execute({ url: VIDEO }, actor);

    expect(again).toMatchObject({ created: true, artifactId: created.artifactId });
    expect(again.requestId).not.toBe(created.requestId);
  });
});
