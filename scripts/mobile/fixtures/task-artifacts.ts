/**
 * Fixtures dos documentos da tarefa (ticket 16): as tarefas com documentos ligados e as listas dos seletores,
 * validadas pelo contrato, e as saídas das funções puras do web (`task-artifact-draft.ts`, `mealCaloriesKcal`,
 * `buildTaskPatch`). O Kotlin confere as suas versões contra elas, caso a caso.
 */
import { artifactSchema, taskSchema, updateTaskInputSchema } from "../../../packages/contracts/src/schemas";
import {
  addDraftArtifact,
  addFoodCopy,
  artifactLinkInputs,
  draftArtifactPositions,
  draftArtifactsFromTask,
  moveDraftArtifact,
  removeDraftArtifact,
  sameArtifactLinks,
  setCopyQuantity,
  type DraftArtifact,
} from "../../../apps/web/src/components/task-detail/task-artifact-draft";
import { buildTaskPatch, draftFromTask, type TaskDraft } from "../../../apps/web/src/components/task-detail/task-draft";
import { mealCaloriesKcal } from "../../../apps/web/src/lib/tasks/task-read-model";

type Input = Record<string, unknown> & { id: string; name: string; type: string; data: unknown };

function artifact(input: Input) {
  return artifactSchema.parse({
    schemaVersion: 1,
    global: false,
    derived: false,
    tags: [],
    revision: 1,
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-14T12:12:00.000Z",
    ...input,
  });
}

function totals(kcal: number, protein = 10, carbs = 20, fat = 5) {
  return { totalCaloriesKcal: kcal, totalProteinGrams: protein, totalCarbohydrateGrams: carbs, totalFatGrams: fat, totalFiberGrams: 2 };
}

function food(id: string, name: string, kcal: number, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return artifact({
    id,
    name,
    type: "food",
    data: {
      description: name,
      items: [{ id: `${id}-item`, name, portion: "1 porção", approximateWeightGrams: 100, caloriesKcal: kcal, macronutrients: { carbohydratesGrams: 20, proteinsGrams: 10, totalFatGrams: 5, fiberGrams: 2 } }],
      totals: totals(kcal),
      nutritionSource: "model-estimate",
      ...data,
    },
    ...extra,
  });
}

const textDoc = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  artifact({ id, name, type: "text", data: { body: `# ${name}\n\nCorpo da nota **${name}**.` }, ...extra });

const sleepDoc = artifact({ id: "doc-sleep", name: "Noite de sono", type: "sleep", data: { trackedSleepTime: 450, score: 87 } });
const skillDoc = artifact({ id: "doc-skill", name: "Pesquisar", type: "skill", data: { path: "hermes/skills/pesquisar/SKILL.md", hash: "abc", missing: false, description: "Pesquisa na web" } });
const routerDoc = artifact({ id: "doc-router", name: "Roteador", type: "router", data: { body: "Roteia pedidos" } });
const workoutGlobal = (id: string, name: string, code: string, category: string) =>
  artifact({ id, name, type: "workout", global: true, data: { code, category, active: true } });
const trainingDoc = artifact({
  id: "doc-training",
  name: "Treino de peito",
  type: "training",
  data: {
    caloriesBurned: 320,
    workouts: [{ id: "w1", workoutCode: "running", workoutName: "Corrida", calories: 320, duration: 30, pace: 6.25, distance: 4.8 }],
  },
});

function link(artifactValue: ReturnType<typeof artifact>, relation: string, fromRecurrence = false) {
  return { relation, fromRecurrence, artifact: artifactValue };
}

function task(input: Record<string, unknown> & { id: string; name: string }) {
  return taskSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    description: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    startedAt: "2026-09-14T15:00:00.000Z",
    artifacts: [],
    subtaskIds: [],
    requests: [],
    ...input,
  });
}

const NOW = "2026-09-14T15:30:45.123Z";

/** A cópia de um alimento que a tarefa já tem, com a quantidade que a pessoa deu, e a que o agente ainda calcula. */
const copy = food("food-copy-1", "Arroz", 156, {}, { quantity: "150 g" });
const pendingFood = food("food-pending", "Suco de laranja", 0, {}, {
  items: [],
  totals: totals(0, 0, 0, 0),
  nutritionSource: undefined,
  generation: { status: "pending" },
});
const createdFood = food("food-created", "Frango grelhado", 247.5);

const meal = task({
  id: "task-meal",
  name: "Almoço",
  kind: "meal",
  revision: 3,
  artifacts: [link(copy, "uses"), link(pendingFood, "uses"), link(createdFood, "creates")],
});

const mealEmpty = task({ id: "task-meal-empty", name: "Jantar", kind: "meal", revision: 2 });

const training = task({
  id: "task-training",
  name: "Treino",
  kind: "training",
  revision: 2,
  artifacts: [link(trainingDoc, "creates"), link(workoutGlobal("ex-run", "Corrida", "running", "cardio"), "uses")],
});

const note = textDoc("doc-note", "Ideias para o projeto", { tags: ["trabalho"] });
const other = textDoc("doc-other", "Pauta da reunião");
const common = task({
  id: "task-common",
  name: "Reunião",
  revision: 4,
  artifacts: [link(note, "uses"), link(skillDoc, "updates"), link(routerDoc, "creates", true), link(sleepDoc, "uses")],
});

/** As tarefas com os tipos de texto livre que não são a nota, uma por relação. */
const news = artifact({ id: "doc-news", name: "Notícias da manhã", type: "news", tags: ["leitura"], data: { body: "# Notícias da manhã\n\n- [Chuva no fim de semana](https://example.com/chuva)" } });
const emailSummary = artifact({ id: "doc-email", name: "Resumo da caixa de entrada", type: "email_summary", data: { body: "Três mensagens pedem resposta.\n\n- A fatura vence amanhã" } });
const transcript = artifact({ id: "doc-youtube", name: "Aula de jardinagem", type: "youtube_transcript", data: { body: "# Aula de jardinagem\n\n00:00 Como podar roseiras" } });
const freeText = task({
  id: "task-free-text",
  name: "Leitura da manhã",
  revision: 2,
  artifacts: [link(news, "uses"), link(emailSummary, "creates"), link(transcript, "updates")],
});

/** Artefatos de um tipo que o contrato de hoje não tem: o artefato é válido como texto e o tipo é trocado depois. */
const futureWithBody = { ...artifact({ id: "doc-future", name: "Mapa do futuro", type: "text", data: { body: "# Mapa do futuro\n\nTexto de um tipo novo." } }), type: "hologram" };
const futureWithoutBody = { ...artifact({ id: "doc-future-bare", name: "Projeção sem texto", type: "text", data: { body: "" } }), type: "hologram", data: { frames: 3 } };
const futureTask = {
  ...task({ id: "task-future", name: "Revisar a projeção", revision: 2 }),
  artifacts: [link(note, "uses"), link(futureWithBody as never, "uses"), link(futureWithoutBody as never, "creates")],
};

const commonEmpty = task({ id: "task-common-empty", name: "Ligar para o banco", revision: 5 });

/** A tarefa depois que outro lugar a mudou: a releitura que o conflito traz. */
const reloaded = { ...commonEmpty, revision: 6, name: "Ligar para o banco (outra aba)" };

const reference = task({ id: "task-reference", name: "Pagar o condomínio", status: undefined, revision: 2 });

const ownFood = food("food-own", "Banana", 89, { tags: ["lanche"] });
const globalFood = food("food-global", "Maçã", 52, { global: true });
const globalFoodTwo = food("food-global-2", "Pão integral", 247, { global: true });

const exercises = [workoutGlobal("ex-run", "Corrida", "running", "cardio"), workoutGlobal("ex-bench", "Supino", "weightlifting", "strength")];
const ownDocs = [note, other, trainingDoc];

function draftArtifacts(source: ReturnType<typeof task>): DraftArtifact[] {
  return draftArtifactsFromTask(source.artifacts);
}

function edit(base: ReturnType<typeof task>, artifacts: DraftArtifact[]): TaskDraft {
  return { ...draftFromTask(base), artifacts };
}

const commonDraft = draftArtifacts(common);
const mealDraft = draftArtifacts(meal);

const KEY = "key-new-1";

const operations = [
  { name: "add a document", list: commonDraft, op: "add", artifact: other, result: addDraftArtifact(commonDraft, other as never) },
  { name: "add a document that is already linked", list: commonDraft, op: "add", artifact: note, result: addDraftArtifact(commonDraft, note as never) },
  { name: "add an exercise", list: draftArtifacts(training), op: "add", artifact: exercises[1], result: addDraftArtifact(draftArtifacts(training), exercises[1] as never) },
  { name: "add a food copy", list: mealDraft, op: "copy", artifact: globalFood, key: KEY, result: addFoodCopy(mealDraft, globalFood as never, KEY) },
  { name: "add the same food copy again", list: addFoodCopy(mealDraft, globalFood as never, KEY), op: "copy", artifact: globalFood, key: "key-new-2", result: addFoodCopy(addFoodCopy(mealDraft, globalFood as never, KEY), globalFood as never, "key-new-2") },
  { name: "set the quantity of a new copy", list: addFoodCopy(mealDraft, globalFood as never, KEY), op: "quantity", id: KEY, quantity: " 2 fatias ", result: setCopyQuantity(addFoodCopy(mealDraft, globalFood as never, KEY), KEY, " 2 fatias ") },
  { name: "set the quantity of an existing food", list: mealDraft, op: "quantity", id: "food-copy-1", quantity: "999 g", result: setCopyQuantity(mealDraft, "food-copy-1", "999 g") },
  { name: "remove a link", list: commonDraft, op: "remove", id: "doc-skill", result: removeDraftArtifact(commonDraft, "doc-skill") },
  { name: "remove what the task created", list: commonDraft, op: "remove", id: "doc-router", result: removeDraftArtifact(commonDraft, "doc-router") },
  { name: "move the first down", list: commonDraft, op: "move", id: "doc-note", step: 1, result: moveDraftArtifact(commonDraft, "doc-note", 1) },
  { name: "move the second up", list: commonDraft, op: "move", id: "doc-skill", step: -1, result: moveDraftArtifact(commonDraft, "doc-skill", -1) },
  { name: "move over what the task created", list: commonDraft, op: "move", id: "doc-skill", step: 1, result: moveDraftArtifact(commonDraft, "doc-skill", 1) },
  { name: "the first cannot go up", list: commonDraft, op: "move", id: "doc-note", step: -1, result: moveDraftArtifact(commonDraft, "doc-note", -1) },
  { name: "the last cannot go down", list: commonDraft, op: "move", id: "doc-sleep", step: 1, result: moveDraftArtifact(commonDraft, "doc-sleep", 1) },
  { name: "what the task created does not move", list: commonDraft, op: "move", id: "doc-router", step: 1, result: moveDraftArtifact(commonDraft, "doc-router", 1) },
].map((item) => ({
  ...item,
  positions: draftArtifactPositions(item.result),
  links: artifactLinkInputs(item.result),
  same: sameArtifactLinks(item.list, item.result),
}));

const patchCases = [
  { name: "unchanged", task: common, draft: edit(common, commonDraft) },
  { name: "document removed", task: common, draft: edit(common, removeDraftArtifact(commonDraft, "doc-skill")) },
  { name: "reordered", task: common, draft: edit(common, moveDraftArtifact(commonDraft, "doc-note", 1)) },
  { name: "added", task: common, draft: edit(common, addDraftArtifact(commonDraft, other as never)) },
  { name: "empty task gets two documents", task: commonEmpty, draft: edit(commonEmpty, addDraftArtifact(addDraftArtifact([], note as never), other as never)) },
  { name: "food copy with quantity", task: meal, draft: edit(meal, setCopyQuantity(addFoodCopy(mealDraft, globalFood as never, KEY), KEY, " 2 fatias ")) },
  { name: "food copy without quantity", task: mealEmpty, draft: edit(mealEmpty, addFoodCopy([], globalFood as never, KEY)) },
  { name: "food copy with blank quantity", task: mealEmpty, draft: edit(mealEmpty, setCopyQuantity(addFoodCopy([], globalFood as never, KEY), KEY, "   ")) },
  { name: "two copies of the same food", task: mealEmpty, draft: edit(mealEmpty, addFoodCopy(addFoodCopy([], globalFood as never, KEY), globalFood as never, "key-new-2")) },
  { name: "exercise added", task: training, draft: edit(training, addDraftArtifact(draftArtifacts(training), exercises[1] as never)) },
  { name: "documents and the name", task: common, draft: { ...edit(common, removeDraftArtifact(commonDraft, "doc-note")), name: "Reunião de revisão" } },
].map((item) => {
  const patch = buildTaskPatch(item.task, item.draft, new Date(NOW));
  if (patch) updateTaskInputSchema.parse({ taskId: item.task.id, ...patch });
  return { name: item.name, task: item.task, draft: item.draft, now: NOW, patch };
});

const calorieCases = [meal, mealEmpty, common, training].map((item) => ({ task: item, kcal: mealCaloriesKcal(item.artifacts) }));

const draftCases = Object.entries({ meal, mealEmpty, training, common, commonEmpty, reference }).map(([key, item]) => ({ key, task: item, draft: draftArtifactsFromTask(item.artifacts) }));

export function taskArtifactsFixtures(): Record<string, unknown> {
  return {
    "task-artifacts-tasks": { meal, mealEmpty, training, common, commonEmpty, reference, freeText, futureTask },
    "task-artifacts-picker-free-text": [news, emailSummary, transcript],
    "task-artifacts-common-empty": commonEmpty,
    "task-artifacts-reloaded": reloaded,
    "task-artifacts-common-linked": { ...commonEmpty, revision: 6, artifacts: [link(other, "uses")] },
    "task-artifacts-meal-linked": { ...mealEmpty, revision: 3, artifacts: [link(food("food-copy-new", "Maçã", 52, {}, { quantity: undefined }), "uses")] },
    "task-artifacts-picker-foods-global": [globalFood, globalFoodTwo],
    "task-artifacts-picker-foods-own": [ownFood, copy],
    "task-artifacts-picker-foods-global-filtered": [globalFood],
    "task-artifacts-picker-foods-own-filtered": [],
    "task-artifacts-picker-exercises": exercises,
    "task-artifacts-picker-own": ownDocs,
    "task-artifacts-picker-own-filtered": [other],
    "task-artifacts-operations": operations,
    "task-artifacts-patch-cases": patchCases,
    "task-artifacts-calories": calorieCases,
    "task-artifacts-drafts": draftCases,
  };
}
