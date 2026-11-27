import { expect, test } from "vitest";
import {
  artifactSchema,
  createArtifactRequestSchema,
  createTaskInputSchema,
  requestSchema,
  taskCardSchema,
  transcriptionDeliveryInputSchema,
  transcriptionLeaseInputSchema,
  updateArtifactRequestSchema,
  updateTaskInputSchema,
} from "./schemas";

const food = {
  description: "arroz", items: [],
  totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
};

test.each(["pending", "completed", "failed"])("food DTO accepts the %s generation state", (status) => {
  const artifact = {
    id: "artifact", name: "Almoço", type: "food", schemaVersion: 1, global: false, derived: false, tags: [], revision: 1,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    data: { ...food, generation: { status }, ...(status === "completed" ? { nutritionSource: "model-estimate" } : {}) },
  };
  expect(artifactSchema.parse(artifact)).toEqual(artifact);
});

test("food generation contract remains strict and a food without generation is valid", () => {
  const base = { id: "artifact", name: "Almoço", type: "food", schemaVersion: 1, global: false, derived: false, tags: [], revision: 1,
    createdAt: "", updatedAt: "", data: food };
  expect(artifactSchema.safeParse(base).success).toBe(true);
  expect(artifactSchema.safeParse({ ...base, data: { ...food, generation: { status: "invented" } } }).success).toBe(false);
  expect(artifactSchema.safeParse({ ...base, data: { ...food, nutritionSource: "catalog" } }).success).toBe(false);
});

test("a training artifact accepts walking as a cardio workout", () => {
  const artifact = {
    id: "artifact", name: "Caminhada", type: "training", schemaVersion: 1, global: false, derived: false, tags: [], revision: 1,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    data: {
      workouts: [
        {
          id: "workout",
          workoutCode: "walking",
          workoutName: "Caminhada",
          calories: 100,
          duration: 120,
          pace: 5,
          distance: 24,
        },
      ],
      caloriesBurned: 100,
    },
  };
  expect(artifactSchema.parse(artifact)).toEqual(artifact);
});

// Nome antigo citado de proposito: este arquivo esta na lista de excecoes da varredura de residuos.
const VELHO = "event";
const nomeAntigo = (campo: string) => campo.replace("task", VELHO).replace("Task", VELHO[0].toUpperCase() + VELHO.slice(1));

test("the task input schemas take the main task and the subtasks", () => {
  expect(createTaskInputSchema.safeParse({ parentTaskId: "t1", subtaskIds: ["t2"] }).success).toBe(true);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, parentTaskId: null, subtaskIds: [] }).success).toBe(true);
  expect(createTaskInputSchema.safeParse({ parentTaskId: ["t1"] }).success).toBe(false);
});

// A sequencia entre tarefas saiu: nem os nomes dela nem os antigos, de evento, passam.
test.each(["previousTaskIds", "nextTaskIds"])("the task input schemas refuse %s and its old name", (field) => {
  expect(createTaskInputSchema.safeParse({ [field]: ["t1"] }).success).toBe(false);
  expect(createTaskInputSchema.safeParse({ [nomeAntigo(field)]: ["t1"] }).success).toBe(false);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, [field]: [] }).success).toBe(false);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, [nomeAntigo(field)]: [] }).success).toBe(false);
});

test("the update schema identifies the task by taskId, not by its old name", () => {
  expect(updateTaskInputSchema.safeParse({ [nomeAntigo("taskId")]: "t1", expectedRevision: 1 }).success).toBe(false);
});

const agentCard = (kind: string, status: string) => ({
  id: "t1", actor: "agent", kind, status, priority: "medium", name: "Guardar", description: "", longRunning: false,
  notifyOffsetsMinutes: [], tags: [], artifactTypes: [], revision: 1, createdAt: "2026-11-26T12:00:00Z", updatedAt: "2026-11-26T12:00:00Z",
});

test.each([
  ["save_content", "done"],
  ["save_content_with_transcription", "awaiting_transcription"],
  ["save_content_with_transcription", "running"],
  ["request", "awaiting_transcription"],
])("a task card accepts the agent kind %s with the status %s", (kind, status) => {
  expect(taskCardSchema.safeParse(agentCard(kind, status)).success).toBe(true);
});

test("a task card refuses a kind or a status that no set has", () => {
  expect(taskCardSchema.safeParse(agentCard("save_page", "done")).success).toBe(false);
  expect(taskCardSchema.safeParse(agentCard("save_content", "transcribing")).success).toBe(false);
});

test("the request list accepts the saved content and the awaiting transcription status", () => {
  const request = {
    id: "r1", kind: "save_content_with_transcription", route: "steps", status: "awaiting_transcription", title: "Vídeo",
    createdAt: "2026-11-26T12:00:00Z", updatedAt: "2026-11-26T12:00:00Z", steps: [], entities: [],
  };
  expect(requestSchema.safeParse(request).success).toBe(true);
  expect(requestSchema.safeParse({ ...request, kind: "save_content", status: "done" }).success).toBe(true);
});

const transcriptionResult = {
  video: { title: "Entrevista", channel: "Canal", durationSeconds: 3600, description: "Links", chapters: [{ startSeconds: 0, title: "Abertura" }] },
  source: "whisper",
  segments: [{ startSeconds: 0, endSeconds: 4.2, speaker: "Falante 1", text: "Olá." }],
  hotMoments: [{ startSeconds: 600, endSeconds: 660, score: 0.9 }],
  comments: [{ author: "ana", text: "Ótimo", likes: 3, publishedAt: "2026-11-20T10:00:00Z" }],
};

test("a transcription delivery carries either the result or a closed failure code", () => {
  const base = { requestId: "r1", leaseToken: "t" };
  expect(transcriptionDeliveryInputSchema.safeParse({ ...base, outcome: "completed", result: transcriptionResult }).success).toBe(true);
  expect(transcriptionDeliveryInputSchema.safeParse({ ...base, outcome: "failed", code: "no_audio" }).success).toBe(true);
  expect(transcriptionDeliveryInputSchema.safeParse({ ...base, outcome: "failed", code: "yt-dlp: ERROR boom" }).success).toBe(false);
  expect(transcriptionDeliveryInputSchema.safeParse({ ...base, outcome: "failed" }).success).toBe(false);
  expect(transcriptionDeliveryInputSchema.safeParse({ ...base, outcome: "completed", code: "failed" }).success).toBe(false);
});

test("a transcription delivery takes at most 50 comments", () => {
  const comments = Array.from({ length: 51 }, () => transcriptionResult.comments[0]);
  const delivery = { requestId: "r1", leaseToken: "t", outcome: "completed", result: { ...transcriptionResult, comments } };
  expect(transcriptionDeliveryInputSchema.safeParse(delivery).success).toBe(false);
});

test("the lease renewal takes a known stage and a percentage from 0 to 100", () => {
  const base = { requestId: "r1", leaseToken: "t" };
  expect(transcriptionLeaseInputSchema.safeParse({ ...base, stage: "download", percent: 40 }).success).toBe(true);
  expect(transcriptionLeaseInputSchema.safeParse({ ...base, stage: "download", percent: 140 }).success).toBe(false);
  expect(transcriptionLeaseInputSchema.safeParse({ ...base, stage: "dancing", percent: 40 }).success).toBe(false);
});

test.each(["news", "email_summary", "youtube_transcript"] as const)("a %s artifact carries the data of a text, on read, create and update", (type) => {
  const artifact = { id: "artifact", name: "Resumo", type, schemaVersion: 1, global: false, derived: false, tags: [], revision: 1,
    createdAt: "", updatedAt: "", data: { body: "# Título\n\ntexto" } };
  expect(artifactSchema.parse(artifact)).toEqual(artifact);
  expect(artifactSchema.safeParse({ ...artifact, data: { description: "não é texto" } }).success).toBe(false);

  expect(createArtifactRequestSchema.safeParse({ type, data: { body: "texto" }, tags: ["leitura"] }).success).toBe(true);
  expect(createArtifactRequestSchema.safeParse({ type }).success).toBe(false);
  expect(updateArtifactRequestSchema.safeParse({ expectedRevision: 1, type, data: { body: "texto novo" } }).success).toBe(true);
});

test("an artifact created without a type is still a text, and an unknown type is refused", () => {
  expect(createArtifactRequestSchema.safeParse({ data: { body: "nota" } }).success).toBe(true);
  expect(createArtifactRequestSchema.safeParse({ type: "podcast", data: { body: "nota" } }).success).toBe(false);
});
