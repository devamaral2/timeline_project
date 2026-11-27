import { expect, test } from "vitest";
import { artifactSchema, createArtifactRequestSchema, createProjectInputSchema, createRecurrenceInputSchema, createTaskInputSchema, projectSchema, requestSchema, setTaskSituationInputSchema, taskCardSchema, taskSchema, transcriptionDeliveryInputSchema, transcriptionLeaseInputSchema, updateArtifactRequestSchema, updateTaskInputSchema } from "./schemas";

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

const card = {
  id: "task", actor: "human", kind: "common", status: "todo", priority: "medium", name: "Ler", description: "",
  project: { id: "project", name: "personal", personal: true }, longRunning: false, notifyOffsetsMinutes: [], tags: [],
  artifactTypes: [], revision: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

test("a task card carries its project, and a card without one is refused", () => {
  expect(taskCardSchema.parse(card)).toEqual(card);
  const { project: _project, ...withoutProject } = card;
  expect(taskCardSchema.safeParse(withoutProject).success).toBe(false);
  expect(taskCardSchema.safeParse({ ...card, project: { id: "project", name: "personal" } }).success).toBe(false);
  expect(projectSchema.safeParse({ ...card.project, color: "red" }).success).toBe(false);
});

test("a request carries its project, and a request without one is refused", () => {
  const request = {
    id: "request", kind: "request", route: "steps", status: "queued", title: "Almocei", project: card.project,
    createdAt: "2026-01-01", updatedAt: "2026-01-01", steps: [], entities: [],
  };
  expect(requestSchema.parse(request)).toEqual(request);
  const { project: _project, ...withoutProject } = request;
  expect(requestSchema.safeParse(withoutProject).success).toBe(false);
});

test("the task input schemas take the project: a string on create, a string or null on update", () => {
  expect(createTaskInputSchema.safeParse({ projectId: "p1" }).success).toBe(true);
  expect(createTaskInputSchema.safeParse({ projectId: null }).success).toBe(false);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, projectId: "p1" }).success).toBe(true);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, projectId: null }).success).toBe(true);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, projectId: 3 }).success).toBe(false);
});

test("the series template takes the project of the series", () => {
  expect(createRecurrenceInputSchema.shape.template.safeParse({ name: "Correr", projectId: "p1" }).success).toBe(true);
});

test("the new project takes only a name", () => {
  expect(createProjectInputSchema.safeParse({ name: "braid" }).success).toBe(true);
  expect(createProjectInputSchema.safeParse({ name: "braid", personal: true }).success).toBe(false);
  expect(createProjectInputSchema.safeParse({}).success).toBe(false);
});

const agentCard = { ...card, actor: "agent", kind: "request", status: "completed" };

test("a finished agent request carries its situation, and only the three values are known", () => {
  for (const situation of ["to_review", "reviewed", "bookmarked"]) {
    expect(taskCardSchema.parse({ ...agentCard, situation })).toEqual({ ...agentCard, situation });
  }
  expect(taskCardSchema.safeParse({ ...agentCard, situation: "archived" }).success).toBe(false);
  expect(taskCardSchema.parse(agentCard)).toEqual(agentCard);
});

test("a situation on a person's task, a step, a scheduled run or an open request is refused", () => {
  expect(taskCardSchema.safeParse({ ...card, status: "done", situation: "reviewed" }).success).toBe(false);
  expect(taskCardSchema.safeParse({ ...agentCard, kind: "step", situation: "reviewed" }).success).toBe(false);
  expect(taskCardSchema.safeParse({ ...agentCard, kind: "cron", situation: "reviewed" }).success).toBe(false);
  expect(taskCardSchema.safeParse({ ...agentCard, status: "running", situation: "reviewed" }).success).toBe(false);
});

test("the task detail and the request carry the situation too", () => {
  const task = { ...agentCard, situation: "to_review", artifacts: [], subtaskIds: [], requests: [] };
  expect(taskSchema.parse(task)).toEqual(task);
  const request = {
    id: "request", kind: "request", route: "steps", status: "completed", situation: "to_review", title: "Almocei",
    project: card.project, createdAt: "2026-01-01", updatedAt: "2026-01-01", steps: [], entities: [],
  };
  expect(requestSchema.parse(request)).toEqual(request);
  expect(requestSchema.safeParse({ ...request, situation: "archived" }).success).toBe(false);
});

test("the situation body takes one of the three values and nothing else", () => {
  expect(setTaskSituationInputSchema.safeParse({ situation: "bookmarked" }).success).toBe(true);
  expect(setTaskSituationInputSchema.safeParse({ situation: "archived" }).success).toBe(false);
  expect(setTaskSituationInputSchema.safeParse({ situation: "reviewed", expectedRevision: 1 }).success).toBe(false);
  expect(setTaskSituationInputSchema.safeParse({}).success).toBe(false);
});

const choice = { provider: "anthropic", model: "claude-opus-5-5", effort: "high" };

test("an agent card passes with and without the model choice of its request", () => {
  expect(taskCardSchema.parse(agentCard)).toEqual(agentCard);
  expect(taskCardSchema.parse({ ...agentCard, model: choice })).toEqual({ ...agentCard, model: choice });
});

test("the model choice on a card must be a whole choice", () => {
  expect(taskCardSchema.safeParse({ ...agentCard, model: { provider: "anthropic" } }).success).toBe(false);
  expect(taskCardSchema.safeParse({ ...agentCard, model: { ...choice, provider: "google" } }).success).toBe(false);
});

const savedContentCard = (kind: string, status: string) => ({
  id: "t1", actor: "agent", kind, status, priority: "medium", name: "Guardar", description: "", project: card.project, longRunning: false,
  notifyOffsetsMinutes: [], tags: [], artifactTypes: [], revision: 1, createdAt: "2026-11-26T12:00:00Z", updatedAt: "2026-11-26T12:00:00Z",
});

test.each([
  ["save_content", "completed"],
  ["save_content_with_transcription", "awaiting_transcription"],
  ["save_content_with_transcription", "running"],
  ["request", "awaiting_transcription"],
])("a task card accepts the agent kind %s with the status %s", (kind, status) => {
  expect(taskCardSchema.safeParse(savedContentCard(kind, status)).success).toBe(true);
});

test("a task card refuses a kind or a status that no set has", () => {
  expect(taskCardSchema.safeParse(savedContentCard("save_page", "completed")).success).toBe(false);
  expect(taskCardSchema.safeParse(savedContentCard("save_content", "transcribing")).success).toBe(false);
});

test("the request list accepts the saved content and the awaiting transcription status", () => {
  const request = {
    id: "r1", kind: "save_content_with_transcription", route: "steps", status: "awaiting_transcription", title: "Vídeo", project: card.project,
    createdAt: "2026-11-26T12:00:00Z", updatedAt: "2026-11-26T12:00:00Z", steps: [], entities: [],
  };
  expect(requestSchema.safeParse(request).success).toBe(true);
  expect(requestSchema.safeParse({ ...request, kind: "save_content", status: "completed" }).success).toBe(true);
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
