/**
 * Fixtures do formulário de tarefa (criar e editar): as respostas validadas pelos schemas do contrato e as saídas das
 * funções puras do web que o formulário usa (`draftFromTask`, `buildCreateTaskInput`, `buildTaskPatch`,
 * `validateTaskDraft`, `rebaseDraft`, `reminderMinutes`, `reminderLabel`, `addReminder`, `addTag`, `normalizeTag`).
 * O Kotlin confere as suas versões contra elas, caso a caso.
 */
import {
  createTaskInputSchema,
  placeSuggestionSchema,
  tagSuggestionSchema,
  taskSchema,
  updateTaskInputSchema,
} from "../../../packages/contracts/src/schemas";
import {
  buildCreateTaskInput,
  buildTaskPatch,
  draftFromTask,
  emptyTaskDraft,
  rebaseDraft,
  validateTaskDraft,
  type TaskDraft,
} from "../../../apps/web/src/components/task-detail/task-draft";
import {
  addReminder,
  addTag,
  normalizeTag,
  reminderLabel,
  reminderMinutes,
  type ReminderUnit,
} from "../../../apps/web/src/components/task-detail/task-reminders-tags";
import { AGENT_SKILLS_PROJECT, PERSONAL_PROJECT, TIMELINE_PROJECT } from "./project";

type TaskInput = Record<string, unknown> & { id: string; name: string };

function task(input: TaskInput) {
  return taskSchema.parse({
    actor: "human",
    kind: "common",
    priority: "medium",
    description: "",
    project: PERSONAL_PROJECT,
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    artifacts: [],
    subtaskIds: [],
    requests: [],
    ...input,
  });
}

/** 14 de setembro de 2026, 12:30 em São Paulo. */
const NOW = "2026-09-14T15:30:45.123Z";

const full = task({
  id: "task-1",
  name: "Reunião de planejamento",
  status: "todo",
  priority: "high",
  description: "Pauta do trimestre.",
  location: "Rua Augusta, 100 - São Paulo",
  startedAt: "2026-09-14T21:30:00.000Z",
  estimatedFinishAt: "2026-09-14T22:20:00.000Z",
  notifyOffsetsMinutes: [1440, 30],
  tags: ["trabalho", "saúde"],
  revision: 4,
});
const reference = task({ id: "task-9", name: "Pagar o condomínio", startedAt: "2026-09-14T03:00:00.000Z", estimatedFinishAt: "2026-09-14T03:00:00.000Z", revision: 4 });
const long = task({
  id: "task-7",
  name: "Projeto longo",
  status: "doing",
  longRunning: true,
  startedAt: "2026-09-01T12:00:00.000Z",
  estimatedFinishAt: "2026-11-30T12:00:00.000Z",
  tags: ["trabalho"],
  revision: 2,
});
const done = task({ id: "task-4", name: "Enviar o relatório", status: "done", finishedAt: "2026-09-13T20:00:00.000Z", startedAt: "2026-09-13T15:00:00.000Z", revision: 3 });
const bare = task({ id: "task-5", name: "Ideia sem data", status: "toDefine", revision: 1 });

/** Uma ocorrência da série `rec-1` de `recurrence.ts` (toda segunda e quarta... às 10:30, desde 21 set). */
const occurrence = task({
  id: "task-occ",
  name: "Treino",
  status: "todo",
  startedAt: "2026-09-23T13:30:00.000Z",
  estimatedFinishAt: "2026-09-23T14:30:00.000Z",
  recurrence: {
    id: "rec-1",
    occurrenceOn: "2026-09-23",
    detached: false,
    rule: {
      frequency: "weekly",
      interval: 1,
      byWeekday: 42,
      timeOfDay: "10:30",
      durationMinutes: 60,
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-21",
    },
  },
  revision: 6,
});

/** Uma tarefa que já está num projeto que não é o `diario`. */
const inProject = task({ id: "task-p", name: "Revisar o contrato", status: "todo", project: TIMELINE_PROJECT, startedAt: "2026-09-14T21:30:00.000Z", revision: 2 });

/** A ocorrência da série `rec-1` quando a série mora no projeto `timeline_project` (`weeklyInProject` de `recurrence.ts`). */
const occurrenceInProject = task({ ...occurrence, id: "task-occ-p", project: TIMELINE_PROJECT });

const tasks = { full, reference, long, done, bare, occurrence, inProject, occurrenceInProject };

function edit(base: ReturnType<typeof task>, changes: Partial<TaskDraft>): TaskDraft {
  return { ...draftFromTask(base), ...changes };
}

const patchCases = [
  { name: "unchanged", task: full, draft: edit(full, {}) },
  { name: "name with spaces only", task: full, draft: edit(full, { name: "  Reunião de planejamento  " }) },
  { name: "name", task: full, draft: edit(full, { name: "  Reunião de revisão " }) },
  { name: "kind and priority", task: full, draft: edit(full, { kind: "meal", priority: "urgent" }) },
  { name: "description", task: full, draft: edit(full, { description: "Outra pauta." }) },
  { name: "status to done", task: full, draft: edit(full, { status: "done" }) },
  { name: "status doing", task: full, draft: edit(full, { status: "doing" }) },
  { name: "status reopened from done", task: done, draft: edit(done, { status: "doing" }) },
  { name: "status to reference", task: full, draft: edit(full, { status: null }) },
  { name: "reference gets status", task: reference, draft: edit(reference, { status: "todo" }) },
  { name: "location cleared", task: full, draft: edit(full, { location: "   " }) },
  { name: "location changed", task: full, draft: edit(full, { location: " Av. Paulista, 1578 " }) },
  { name: "location from none", task: bare, draft: edit(bare, { location: "Casa" }) },
  { name: "start moved", task: full, draft: edit(full, { startTime: "09:05" }) },
  { name: "start to day only", task: full, draft: edit(full, { startTime: "" }) },
  { name: "start cleared", task: full, draft: edit(full, { startDate: "", startTime: "" }) },
  { name: "end set on bare", task: bare, draft: edit(bare, { startDate: "2026-09-20", startTime: "10:00", endDate: "2026-09-20", endTime: "11:30" }) },
  { name: "end cleared", task: full, draft: edit(full, { endDate: "", endTime: "" }) },
  { name: "reminders", task: full, draft: edit(full, { reminders: [5, 60, 2880] }) },
  { name: "reminders cleared", task: full, draft: edit(full, { reminders: [] }) },
  { name: "tags", task: full, draft: edit(full, { tags: ["casa", "trabalho"] }) },
  { name: "tags same", task: full, draft: edit(full, { tags: ["trabalho", "saúde"] }) },
  { name: "project chosen", task: full, draft: edit(full, { project: TIMELINE_PROJECT }) },
  { name: "project same as the task", task: inProject, draft: edit(inProject, { project: { ...TIMELINE_PROJECT } }) },
  { name: "project swapped", task: inProject, draft: edit(inProject, { project: AGENT_SKILLS_PROJECT }) },
  { name: "project back to personal", task: inProject, draft: edit(inProject, { project: PERSONAL_PROJECT }) },
  { name: "project and name", task: full, draft: edit(full, { name: "Reunião de revisão", project: AGENT_SKILLS_PROJECT }) },
  { name: "persistent on", task: full, draft: edit(full, { longRunning: true }) },
  { name: "persistent off", task: long, draft: edit(long, { longRunning: false }) },
  {
    name: "everything",
    task: full,
    draft: edit(full, {
      kind: "training",
      name: "Treino",
      description: "",
      location: "",
      priority: "low",
      status: "done",
      startDate: "2026-09-15",
      startTime: "",
      endDate: "",
      endTime: "",
      reminders: [10],
      tags: [],
      longRunning: true,
    }),
  },
].map((item) => {
  const patch = buildTaskPatch(item.task, item.draft, new Date(NOW));
  if (patch) updateTaskInputSchema.parse({ taskId: item.task.id, ...patch });
  return { name: item.name, task: item.task, draft: item.draft, now: NOW, patch };
});

const createDrafts: { name: string; draft: TaskDraft }[] = [
  { name: "minimal", draft: emptyTaskDraft("  Comprar pão  ") },
  {
    name: "full",
    draft: {
      ...emptyTaskDraft("Almoço com a Ana"),
      kind: "meal",
      status: "todo",
      priority: "urgent",
      startDate: "2026-09-20",
      startTime: "10:30",
      endDate: "2026-09-20",
      endTime: "11:30",
      description: "Levar o contrato.",
      location: " Rua A, 10 ",
      reminders: [30, 1440],
      tags: ["trabalho", "casa"],
    },
  },
  { name: "project chosen", draft: { ...emptyTaskDraft("No projeto"), project: TIMELINE_PROJECT } },
  { name: "personal chosen leaves the project out", draft: { ...emptyTaskDraft("Em personal"), project: PERSONAL_PROJECT } },
  { name: "done", draft: { ...emptyTaskDraft("Já fiz"), status: "done" } },
  { name: "day only", draft: { ...emptyTaskDraft("Dia inteiro"), status: "toDefine", startDate: "2026-09-21", endDate: "2026-09-22" } },
  { name: "blank location", draft: { ...emptyTaskDraft("Sem local"), location: "   " } },
].map((item) => item);

const createCases = createDrafts.map((item) => {
  const input = buildCreateTaskInput(item.draft, new Date(NOW));
  createTaskInputSchema.parse(input);
  return { name: item.name, draft: item.draft, now: NOW, input };
});

const validateDrafts: { name: string; draft: TaskDraft }[] = [
  { name: "valid", draft: emptyTaskDraft("Algo") },
  { name: "empty name", draft: emptyTaskDraft("   ") },
  { name: "long location", draft: { ...emptyTaskDraft("Algo"), location: "x".repeat(301) } },
  { name: "location at limit", draft: { ...emptyTaskDraft("Algo"), location: "x".repeat(300) } },
  { name: "times without dates", draft: { ...emptyTaskDraft("Algo"), startTime: "10:00", endTime: "11:00" } },
  { name: "end before start", draft: { ...emptyTaskDraft("Algo"), startDate: "2026-09-20", startTime: "10:00", endDate: "2026-09-20", endTime: "09:00" } },
  { name: "end equal to start", draft: { ...emptyTaskDraft("Algo"), startDate: "2026-09-20", startTime: "10:00", endDate: "2026-09-20", endTime: "10:00" } },
  { name: "exactly 31 days", draft: { ...emptyTaskDraft("Algo"), startDate: "2026-09-01", endDate: "2026-10-02" } },
  { name: "over 31 days", draft: { ...emptyTaskDraft("Algo"), startDate: "2026-09-01", endDate: "2026-10-03" } },
  { name: "persistent without status", draft: { ...emptyTaskDraft("Algo"), longRunning: true } },
  { name: "persistent missed", draft: { ...emptyTaskDraft("Algo"), longRunning: true, status: "missed" } },
  { name: "persistent over 31 days", draft: { ...emptyTaskDraft("Algo"), longRunning: true, status: "doing", startDate: "2026-01-01", endDate: "2026-12-31" } },
  { name: "persistent end before start", draft: { ...emptyTaskDraft("Algo"), longRunning: true, status: "doing", startDate: "2026-09-20", endDate: "2026-09-10" } },
  { name: "persistent reminders without deadline", draft: { ...emptyTaskDraft("Algo"), longRunning: true, status: "todo", reminders: [30] } },
  { name: "persistent reminders with deadline", draft: { ...emptyTaskDraft("Algo"), longRunning: true, status: "todo", endDate: "2026-12-01", reminders: [30] } },
  { name: "several", draft: { ...emptyTaskDraft(""), longRunning: true, location: "x".repeat(301), endTime: "10:00" } },
];
const validateCases = validateDrafts.map((item) => ({ name: item.name, draft: item.draft, errors: validateTaskDraft(item.draft) }));

const edited = task({ ...full, name: "Reunião (renomeada)", priority: "urgent", location: "Novo endereço", notifyOffsetsMinutes: [60], revision: 5 });
const rebaseCases = [
  {
    name: "touched field stays, untouched follows",
    previous: full,
    next: edited,
    draft: edit(full, { name: "Meu título", tags: ["novo"] }),
  },
  { name: "nothing touched takes everything", previous: full, next: edited, draft: edit(full, {}) },
  {
    name: "same value typed as before follows the new one",
    previous: full,
    next: edited,
    draft: edit(full, { priority: "high", description: "Pauta do trimestre." }),
  },
  {
    name: "project touched stays, project untouched follows",
    previous: inProject,
    next: task({ ...inProject, project: AGENT_SKILLS_PROJECT, name: "Revisar o contrato (v2)", revision: 3 }),
    draft: edit(inProject, { name: "Meu título", project: AGENT_SKILLS_PROJECT }),
  },
  { name: "project untouched follows the new one", previous: inProject, next: task({ ...inProject, project: AGENT_SKILLS_PROJECT, revision: 3 }), draft: edit(inProject, {}) },
  { name: "dates and status", previous: full, next: task({ ...full, status: "doing", startedAt: "2026-09-15T12:00:00.000Z", revision: 5 }), draft: edit(full, { status: "done" }) },
].map((item) => ({ ...item, expected: rebaseDraft(item.draft, item.previous, item.next) }));

const reminderInputs: { amount: number; unit: ReminderUnit }[] = [
  { amount: 1, unit: "minutes" },
  { amount: 0, unit: "minutes" },
  { amount: 45, unit: "minutes" },
  { amount: 1.5, unit: "minutes" },
  { amount: 43200, unit: "minutes" },
  { amount: 43201, unit: "minutes" },
  { amount: 1, unit: "days" },
  { amount: 30, unit: "days" },
  { amount: 31, unit: "days" },
  { amount: -2, unit: "days" },
  { amount: 0.5, unit: "days" },
];

const labelMinutes = [1, 5, 30, 59, 60, 90, 1440, 2880, 10080, 43200];

const reminderLists = [
  { list: [], add: 30 },
  { list: [30, 1440], add: 60 },
  { list: [30, 1440], add: 30 },
  { list: [1440, 30], add: 5 },
  { list: [5], add: 43200 },
];

const tagInputs = ["  Trabalho ", "CASA", "   ", "saúde", "Ação Rápida"];

export function taskEditFixtures(): Record<string, unknown> {
  return {
    "task-edit-tasks": Object.fromEntries(Object.entries(tasks).map(([key, value]) => [key, value])),
    "task-edit-reloaded": edited,
    "task-edit-draft-from-task": Object.entries(tasks).map(([key, value]) => ({ name: key, task: value, draft: draftFromTask(value) })),
    "task-edit-empty-draft": { empty: emptyTaskDraft(), named: emptyTaskDraft("comprar pão") },
    "task-edit-create-cases": createCases,
    "task-edit-patch-cases": patchCases,
    "task-edit-validate-cases": validateCases,
    "task-edit-rebase-cases": rebaseCases,
    "task-edit-reminder-cases": {
      minutes: reminderInputs.map((input) => ({ ...input, minutes: reminderMinutes(input.amount, input.unit) })),
      labels: labelMinutes.map((minutes) => ({ minutes, label: reminderLabel(minutes) })),
      lists: reminderLists.map((item) => ({ ...item, result: addReminder(item.list, item.add) })),
    },
    "task-edit-tag-cases": tagInputs.map((raw) => ({ raw, normalized: normalizeTag(raw), added: addTag(["casa"], raw) })),
    "task-edit-created": { taskId: "task-new" },
    "task-edit-tag-suggestions": tagSuggestionSchema.array().parse([
      { id: "tag-1", name: "trabalho" },
      { id: "tag-2", name: "trabalho-novo" },
      { id: "tag-3", name: "retrabalho" },
      { id: "tag-4", name: "casa" },
    ]),
    "task-edit-place-suggestions": placeSuggestionSchema.array().parse([
      { name: "Padaria Pão Quente", address: "Rua das Flores, 10 - São Paulo", label: "Padaria Pão Quente - Rua das Flores, 10 - São Paulo" },
      { name: "Paulista", address: "Av. Paulista, 1578 - São Paulo", label: "Av. Paulista, 1578 - São Paulo" },
    ]),
  };
}
