/**
 * Fixtures dos Documentos (artefatos): as respostas de `GET /api/artifacts` e
 * `GET /api/artifacts/{id}` validadas pelo schema do contrato e as saídas das
 * funções do web que a lista e a leitura usam (`artifactTypeLabel`,
 * `artifactVisualType`, `artifactCountLabel`, `noteMarkdownOf`, `whenLabel`,
 * `sleepAgendaOfArtifact`, `formatDecimal`, `formatMinutes`, `formatPace`,
 * `groupSetsByExercise`, `pluralize`, `dateLineOf`). `macroShares` mora num
 * componente `"use client"` que o tsx não carrega; a expressão é repetida aqui, igual.
 */
import { artifactSchema } from "../../../packages/contracts/src/schemas";
import { ARTIFACT_TYPE_ORDER, artifactCountLabel, artifactTypeLabel, artifactVisualType, sleepAgendaOfArtifact } from "../../../apps/web/src/lib/artifacts/artifact-model";
import { noteMarkdownOf, whenLabel } from "../../../apps/web/src/lib/notes/notes-model";
import { dateLineOf, formatDecimal, formatMinutes, formatPace, groupSetsByExercise, minutesBetween, pluralize } from "../../../apps/web/src/lib/tasks/task-detail-format";
import { failedMealMessage, pendingMealMessage } from "../../../apps/web/src/lib/notes/meal-generation";

/** Cópia literal de `macroShares` em `components/notes/NoteBody.tsx`. */
function macroShares(totals: { totalProteinGrams: number; totalCarbohydrateGrams: number; totalFatGrams: number }): [number, number, number] {
  const kcal = [totals.totalProteinGrams * 4, totals.totalCarbohydrateGrams * 4, totals.totalFatGrams * 9];
  const sum = kcal[0] + kcal[1] + kcal[2];
  if (sum <= 0) return [0, 0, 0];
  const shares = kcal.map((value) => Math.round((value / sum) * 100));
  return [shares[0] ?? 0, shares[1] ?? 0, shares[2] ?? 0];
}

/** 14 de setembro de 2026, 12:00 em São Paulo. */
export const DOCUMENTS_NOW = "2026-09-14T15:00:00.000Z";

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

const foodTotals = { totalCaloriesKcal: 612.5, totalProteinGrams: 38.2, totalCarbohydrateGrams: 64.05, totalFatGrams: 21.15, totalFiberGrams: 9 };

const food = (id: string, name: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}) =>
  artifact({
    id,
    name,
    type: "food",
    tags: ["casa"],
    data: {
      description: "Arroz, feijão e frango grelhado",
      items: [
        { id: "item-1", name: "Arroz", portion: "4 colheres", approximateWeightGrams: 120, caloriesKcal: 156, macronutrients: { carbohydratesGrams: 34, proteinsGrams: 3, totalFatGrams: 0.5, fiberGrams: 1 } },
        { id: "item-2", name: "Frango grelhado", portion: "", approximateWeightGrams: 150, caloriesKcal: 247.5, macronutrients: { carbohydratesGrams: 0, proteinsGrams: 33, totalFatGrams: 12, fiberGrams: 0 } },
      ],
      totals: foodTotals,
      recipe: {
        source: "model",
        servings: 2,
        prepTimeMinutes: 75,
        ingredients: [{ name: "Arroz", quantity: "300 g" }, { name: "Sal", quantity: "a gosto" }, { name: "Sal", quantity: "1 pitada" }],
        steps: ["Lave o arroz.", "Refogue o alho.", "Cozinhe por 20 minutos."],
      },
      nutritionSource: "model-estimate",
      ...data,
    },
    ...extra,
  });

const pendingData = { items: [], totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 }, recipe: undefined, nutritionSource: undefined, generation: { status: "pending" } };

const textNote = artifact({
  id: "doc-text",
  name: "Ideias para o projeto",
  type: "text",
  tags: ["trabalho", "ideias"],
  data: { body: "# Ideias para o projeto\n\nUm **parágrafo** com _ênfase_, `código` e um [link](https://example.com/a).\n\n- Primeiro\n- Segundo\n\n1. Um\n2. Dois\n\n- [x] Feito\n- [ ] A fazer\n\n> Citação\n\n```ts\nconst a = 1;\n```\n" },
});

const week = (relation: string, taskId: string, name: string, kind: string, extra: Record<string, unknown> = {}) => ({ taskId, relation, name, actor: "human", kind, ...extra });

/** Um artefato de cada tipo de texto livre que não é a nota: o mesmo dado, com o tipo próprio. */
const freeTextDocuments = [
  artifact({ id: "doc-news", name: "Notícias da manhã", type: "news", tags: ["leitura"], data: { body: "# Notícias da manhã\n\n- [Chuva no fim de semana](https://example.com/chuva)" } }),
  artifact({ id: "doc-email", name: "Resumo da caixa de entrada", type: "email_summary", data: { body: "Três mensagens pedem resposta.\n\n- A fatura vence amanhã" } }),
  artifact({ id: "doc-youtube", name: "Aula de jardinagem", type: "youtube_transcript", data: { body: "# Aula de jardinagem\n\n00:00 Como podar roseiras" } }),
];

const documents = [
  textNote,
  ...freeTextDocuments,
  food("doc-food", "Almoço de ontem", { tasks: [week("creates", "task-2", "Almoço", "meal", { startedAt: "2026-09-13T15:00:00.000Z" })] }),
  artifact({ id: "doc-sleep", name: "Noite de sono", type: "sleep", tags: ["saúde"], data: { trackedSleepTime: 450, score: 87 }, tasks: [week("creates", "task-6", "Dormir", "sleep", { startedAt: "2026-09-15T01:00:00.000Z", estimatedFinishAt: "2026-09-15T09:00:00.000Z" })] }),
  artifact({
    id: "doc-training",
    name: "Treino de peito",
    type: "training",
    data: {
      caloriesBurned: 640,
      workouts: [
        { id: "w1", workoutCode: "running", workoutName: "Corrida", calories: 320, duration: 30, pace: 6.25, distance: 4.8 },
        { id: "w2", workoutCode: "weightlifting", workoutName: "Musculação", calories: 280, duration: 45, sets: [
          { id: "s1", exercise: "Supino", repetitions: 10, weight: 60 },
          { id: "s2", exercise: "Supino", repetitions: 8, weight: 62.5 },
          { id: "s3", exercise: "Crucifixo", repetitions: 12, weight: 14 },
        ] },
        { id: "w3", workoutCode: "free", workoutName: "Alongamento", calories: 40, duration: 15 },
      ],
    },
  }),
  artifact({ id: "doc-workout", name: "Corrida", type: "workout", global: true, data: { code: "running", category: "cardio", active: true } }),
  artifact({ id: "doc-skill", name: "Pesquisar", type: "skill", data: { path: "hermes/skills/pesquisar/SKILL.md", hash: "abc", missing: false, description: "Pesquisa na web" } }),
  artifact({ id: "doc-agent", name: "Planejador", type: "agent", data: { path: "hermes/agents/planejador.md", hash: "def", missing: true } }),
  artifact({ id: "doc-router", name: "Roteador", type: "router", data: { body: "Roteia pedidos" } }),
];

/**
 * Artefatos de um tipo que o contrato de hoje não tem (o de uma versão mais nova): o contrato recusa o tipo, então o
 * artefato é montado como um texto válido e o tipo é trocado depois. Um traz `body`, o outro um dado de outra forma.
 */
const FUTURE_TYPE = "hologram";
const futureWithBody = {
  ...artifact({ id: "doc-future", name: "Mapa do futuro", type: "text", tags: ["novo"], data: { body: "# Mapa do futuro\n\nTexto de um tipo que este app não conhece." } }),
  type: FUTURE_TYPE,
};
const futureWithoutBody = {
  ...artifact({ id: "doc-future-bare", name: "Projeção sem texto", type: "text", data: { body: "" } }),
  type: FUTURE_TYPE,
  data: { frames: 3 },
};

/** O artefato de exemplo de um tipo: pelo tipo, e não pela posição, para a lista poder crescer. */
function documentOf(type: string) {
  const found = documents.find((document) => document.type === type);
  if (!found) throw new Error(`sem artefato de exemplo do tipo ${type}`);
  return found;
}

const DETAIL_TASKS = [
  week("creates", "task-1", "Reunião de planejamento", "common", { startedAt: "2026-09-14T12:00:00.000Z" }),
  week("uses", "task-3", "Buscar passagens", "search_request", { startedAt: "2026-09-12T12:00:00.000Z" }),
];

const WHEN_INSTANTS = [
  "2026-09-14T12:00:00.000Z", "2026-09-14T02:59:00.000Z", "2026-09-13T15:10:00.000Z", "2026-09-15T11:00:00.000Z", "2026-09-11T12:00:00.000Z",
  "2026-09-17T12:00:00.000Z", "2025-12-31T23:30:00.000Z", "2027-01-02T12:00:00.000Z", "2026-01-01T03:00:00.000Z", "2026-05-03T12:00:00.000Z",
  "2026-02-20T12:00:00.000Z", "2026-10-21T12:00:00.000Z", "2026-11-30T12:00:00.000Z", "2026-12-01T12:00:00.000Z", "2026-03-31T12:00:00.000Z", "2026-04-01T12:00:00.000Z",
];

const DECIMALS = [0, 1, 0.04, 0.05, 0.15, 0.25, 1.05, 1.15, 1.25, 2.35, 38.2, 64.05, 612.5, 612.55, 999.95, 1234.5, 1234.56, 1000000, 21.15, 62.5, 0.1 + 0.2, 7.0000001, -1.25];
const MINUTES = [0, 1, 45, 59, 59.6, 60, 61, 90, 450, 452.4, 1440, -5];
const PACES = [6.25, 6, 5.999, 5.5, 7.1666, 4.99, 8.9999, 0, 10.5];
const MARKDOWNS = [
  { name: "Ideias", body: "# Ideias\n\nTexto" },
  { name: "Ideias", body: "\n\n  ## Ideias  \nTexto\n" },
  { name: "Ideias", body: "# Outro título\nTexto" },
  { name: "Ideias", body: "Ideias\r\nresto\r\nmais" },
  { name: "Ideias", body: "" },
  { name: "Ideias", body: "# Ideias" },
  { name: "Ideias", body: "#Ideias\ntexto" },
  { name: "Ideias", body: "####### Ideias\ntexto" },
  { name: "Ideias", body: "Antes\n# Ideias\ndepois" },
];

export function documentsFixtures(): Record<string, unknown> {
  const now = new Date(DOCUMENTS_NOW);
  const withTasks = { ...documents[0], tasks: DETAIL_TASKS };
  return {
    "documents-list": documents,
    "documents-list-empty": [],
    "documents-list-filtered": [documents[0]],
    "documents-global-foods": [
      food("doc-global-food", "Banana", { global: true, tags: [] }, { description: "Banana", items: [], recipe: undefined }),
    ],
    "documents-list-unknown": [textNote, futureWithBody, futureWithoutBody, documentOf("news")],
    "documents-detail-unknown": { ...futureWithBody, tasks: DETAIL_TASKS },
    "documents-detail-unknown-no-body": futureWithoutBody,
    "documents-detail-text": withTasks,
    "documents-detail-text-single-task": { ...documents[0], tasks: [DETAIL_TASKS[0]] },
    "documents-detail-text-global": { ...documents[0], id: "doc-text-global", global: true, tasks: DETAIL_TASKS },
    "documents-detail-news": documentOf("news"),
    "documents-detail-email-summary": documentOf("email_summary"),
    "documents-detail-youtube-transcript": documentOf("youtube_transcript"),
    "documents-detail-food": documentOf("food"),
    "documents-detail-food-pending": food("doc-food-pending", "Prato novo", {}, pendingData),
    "documents-detail-food-done": food("doc-food-pending", "Prato novo"),
    "documents-detail-food-failed": food("doc-food-pending", "Prato novo", {}, { ...pendingData, generation: { status: "failed" } }),
    "documents-detail-sleep": documentOf("sleep"),
    "documents-detail-training": documentOf("training"),
    "documents-detail-workout": documentOf("workout"),
    "documents-detail-skill": documentOf("skill"),
    "documents-detail-agent": documentOf("agent"),
    "documents-detail-router": documentOf("router"),
    "documents-model": {
      now: now.toISOString(),
      typeOrder: ARTIFACT_TYPE_ORDER,
      labels: ARTIFACT_TYPE_ORDER.map((type) => ({ type, label: artifactTypeLabel(type), visual: artifactVisualType(type) })),
      counts: [0, 1, 2, 17].map((count) => ({ count, label: artifactCountLabel(count) })),
      whenLabels: WHEN_INSTANTS.map((instant) => ({ instant, label: whenLabel(instant, now) })),
      markdown: [...MARKDOWNS, ...documents.filter((doc) => doc.type === "text" || doc.type === "router").map((doc) => ({ name: doc.name, body: (doc.data as { body: string }).body }))].map(
        ({ name, body }) => ({ name, body, result: noteMarkdownOf({ type: "text", name, data: { body } } as never) }),
      ),
      sleepAgenda: [
        [],
        [{ taskId: "t", relation: "creates", name: "n", actor: "human", kind: "sleep" }],
        [{ taskId: "t", relation: "creates", name: "n", actor: "human", kind: "sleep", startedAt: "2026-09-15T01:00:00.000Z", estimatedFinishAt: "2026-09-15T09:00:00.000Z" }],
        [{ taskId: "t", relation: "creates", name: "n", actor: "human", kind: "sleep", startedAt: "2026-09-14T14:00:00.000Z" }],
        [{ taskId: "t", relation: "creates", name: "n", actor: "human", kind: "sleep", startedAt: "2026-09-30T23:00:00.000Z", estimatedFinishAt: "2026-10-01T07:00:00.000Z" }],
        [{ taskId: "t", relation: "creates", name: "n", actor: "human", kind: "sleep", startedAt: "2026-09-30T20:00:00.000Z", estimatedFinishAt: "2026-10-01T20:00:00.000Z" }],
      ].map((tasks) => ({ tasks, result: sleepAgendaOfArtifact(tasks as never) })),
      dateLines: [
        ["2026-09-14T12:00:00.000Z"], ["2026-09-15T01:00:00.000Z", "2026-09-15T09:00:00.000Z"], ["2026-09-14T22:00:00.000Z", "2026-09-15T09:00:00.000Z"],
        ["2026-09-30T23:00:00.000Z", "2026-10-01T07:00:00.000Z"], ["2026-09-14T12:00:00.000Z", "2026-09-14T13:00:00.000Z"],
      ].map(([startedAt, finishedAt]) => ({ startedAt, finishedAt: finishedAt ?? null, result: dateLineOf(startedAt as string, finishedAt) })),
      minutesBetween: [["2026-09-15T01:00:00.000Z", "2026-09-15T09:00:00.000Z"], ["2026-09-15T09:00:00.000Z", "2026-09-15T01:00:00.000Z"]].map(([from, to]) => ({
        from, to, result: minutesBetween(from as string, to as string),
      })),
      decimals: DECIMALS.map((value) => ({ value, result: formatDecimal(value) })),
      minutes: MINUTES.map((value) => ({ value, result: formatMinutes(value) })),
      paces: PACES.map((value) => ({ value, result: formatPace(value) })),
      plurals: [0, 1, 2].map((count) => ({ count, result: pluralize(count, "série", "séries") })),
      macros: [
        { totalProteinGrams: 38.2, totalCarbohydrateGrams: 64.05, totalFatGrams: 21.15 },
        { totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0 },
        { totalProteinGrams: 10, totalCarbohydrateGrams: 0, totalFatGrams: 0 },
        { totalProteinGrams: 25, totalCarbohydrateGrams: 25, totalFatGrams: 10 },
      ].map((totals) => ({ ...totals, result: macroShares(totals) })),
      setGroups: (documentOf("training").data as { workouts: Array<{ sets?: never[] }> }).workouts
        .filter((workout) => workout.sets)
        .map((workout) => ({ sets: workout.sets, result: groupSetsByExercise(workout.sets as never).map((group) => ({ exercise: group.exercise, setIds: group.sets.map((set) => set.id) })) })),
      messages: { pending: pendingMealMessage, failed: failedMealMessage },
    },
  };
}
