import { expect, test } from "vitest";
import { artifactSchema, createProjectInputSchema, createRecurrenceInputSchema, createTaskInputSchema, projectSchema, requestSchema, setTaskSituationInputSchema, taskCardSchema, taskSchema, updateTaskInputSchema } from "./schemas";

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
