import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { mobileContractSchemas } from "../../packages/contracts/src/schemas";
import { darkTheme, lightTheme, tagColors, hueForTag } from "../../packages/theme/src/theme";
import { dayKeyOf, groupEventsByDay, mergeTimelinePage, weekOf } from "../../packages/timeline/src";

const fixtureDirectory = fileURLToPath(new URL("../../apps/mobile/app/src/test/resources/fixtures/", import.meta.url));

function writeFixture<T>(name: string, schema: z.ZodType<T>, example: unknown): void {
  const parsed = schema.parse(example);
  writeFileSync(`${fixtureDirectory}${name}.json`, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

const noteTimestamps = { createdAt: "2026-09-22T11:00:00.000Z", updatedAt: "2026-09-22T11:05:00.000Z" };

/** As notes como o detalhe do evento as devolve: sem `links`, que so a API de notas preenche. */
const eventNotes = {
  text: {
    id: "note-text",
    name: "Aquecimento",
    type: "text" as const,
    schemaVersion: 1,
    data: { body: "Mobilidade de quadril antes das series." },
    tags: ["foco"],
    revision: 1,
    ...noteTimestamps,
  },
  meal: {
    id: "note-meal",
    name: "Café da manhã",
    type: "meal" as const,
    schemaVersion: 1,
    data: {
      name: "Café da manhã",
      description: "Aveia e fruta",
      foodItems: [{
        id: "food-oats",
        name: "Aveia",
        portion: "40 g",
        approximateWeightGrams: 40,
        caloriesKcal: 152,
        macronutrients: { carbohydratesGrams: 27, proteinsGrams: 5, totalFatGrams: 3, fiberGrams: 4 },
      }],
      totals: {
        totalCaloriesKcal: 152,
        totalProteinGrams: 5,
        totalCarbohydrateGrams: 27,
        totalFatGrams: 3,
        totalFiberGrams: 4,
      },
      recipe: {
        source: "model" as const,
        servings: 1,
        prepTimeMinutes: 10,
        ingredients: [
          { name: "Aveia em flocos", quantity: "40 g" },
          { name: "Banana", quantity: "1 unidade" },
        ],
        steps: ["Misture a aveia com o leite.", "Aqueça por 2 minutos e acrescente a banana."],
      },
    },
    tags: [],
    revision: 1,
    ...noteTimestamps,
  },
  sleep: {
    id: "note-sleep",
    name: "Noite anterior",
    type: "sleep" as const,
    schemaVersion: 1,
    data: { trackedSleepTime: 7.5, score: 86 },
    tags: [],
    revision: 1,
    ...noteTimestamps,
  },
  training: {
    id: "note-training",
    name: "Treino da manhã",
    type: "training" as const,
    schemaVersion: 1,
    data: {
      caloriesBurned: 450,
      workouts: [
        { id: "workout-treadmill", workoutCode: "treadmill" as const, workoutName: "Esteira", calories: 120, duration: 20, pace: 6.5, distance: 3.1 },
        { id: "workout-running", workoutCode: "running" as const, workoutName: "Corrida", calories: 170, duration: 25, pace: 5.8, distance: 4.3 },
        { id: "workout-weights", workoutCode: "weightlifting" as const, workoutName: "Força", calories: 130, duration: 30, sets: [{ id: "set-1", exercise: "Agachamento", repetitions: 10, weight: 40 }] },
        { id: "workout-free", workoutCode: "free" as const, workoutName: "Mobilidade", calories: 30, duration: 10 },
      ],
    },
    tags: ["saúde"],
    revision: 2,
    ...noteTimestamps,
  },
};

const timelineEvents = [
  {
    id: "event-training",
    kind: "training" as const,
    noteTypes: ["training", "text"],
    missed: false,
    name: "Treino da manhã",
    description: "Cardio e força",
    startedAt: "2026-09-22T08:00:00-03:00",
    finishedAt: "2026-09-22T09:05:00-03:00",
    notifyOffsetsMinutes: [10],
    durationLabel: "1h 05m",
    tags: ["saúde", "foco"],
    interruptions: [{ name: "Água", description: "Pausa rápida", durationLabel: "5m" }],
  },
  {
    id: "event-note",
    kind: "routine" as const,
    noteTypes: [],
    missed: true,
    name: "Leitura",
    description: "",
    startedAt: "2026-09-21T21:00:00-03:00",
    notifyOffsetsMinutes: [],
    durationLabel: "30m",
    tags: [],
    interruptions: [],
  },
];

const eventDetail = {
  id: "event-training",
  name: "Treino da manhã",
  description: "Cardio e força",
  startedAt: "2026-09-22T08:00:00-03:00",
  finishedAt: "2026-09-22T09:05:00-03:00",
  tags: ["saúde", "foco"],
  missed: false,
  priority: "normal" as const,
  notifyOffsetsMinutes: [10],
  interruptions: [{ id: "interrupt-1", name: "Água", description: "Pausa rápida", startedAt: "2026-09-22T08:20:00-03:00", finishedAt: "2026-09-22T08:25:00-03:00" }],
  revision: 3,
  kind: "training" as const,
  notes: [eventNotes.training, eventNotes.text, eventNotes.meal, eventNotes.sleep],
};

const createEventInput = {
  name: "Novo bloco",
  tags: ["planejamento"],
  priority: "flexible" as const,
  kind: "meal" as const,
  notes: [
    { type: "text" as const, name: "Contexto", data: { body: "Almoço antes da reunião." } },
    { type: "meal" as const, data: { inputText: "banana com iogurte" } },
    { type: "sleep" as const, data: { score: 80 } },
    { type: "training" as const, data: { workouts: [{ workoutCode: "free" }] } },
  ],
  noteIds: ["note-existing"],
};

/** O PATCH manda a lista inteira: a note so com `id` continua, com `data` e editada, sem `id` nasce. */
const updateEventInput = {
  eventId: "event-training",
  expectedRevision: 3,
  description: "Cardio, força e mobilidade",
  kind: "training" as const,
  notes: [
    { id: eventNotes.text.id },
    { id: eventNotes.training.id, schemaVersion: 1, type: "training" as const, data: eventNotes.training.data },
    { id: eventNotes.meal.id, schemaVersion: 1, type: "meal" as const, data: eventNotes.meal.data },
    { id: eventNotes.sleep.id, schemaVersion: 1, type: "sleep" as const, data: eventNotes.sleep.data },
    { type: "text" as const, data: { body: "Alongamento no final." } },
  ],
};

export function generateFixtures(): void {
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFixture("timeline-page", mobileContractSchemas.timelineEventPage, { items: timelineEvents, nextCursor: "cursor-2" });
  writeFixture("event-detail", mobileContractSchemas.eventDetail, eventDetail);
  writeFixture("create-event-input", mobileContractSchemas.createEventInput, createEventInput);
  writeFixture("update-event-input", mobileContractSchemas.updateEventInput, updateEventInput);
  // A API de notas preenche `links`; o PATCH manda a lista completa de eventos e tarefas (vazia solta a nota).
  writeFixture("note-list", z.array(mobileContractSchemas.note), [
    {
      id: "note-training", name: "Treino A · peito e tríceps", type: "text" as const, schemaVersion: 1,
      data: { body: "415 kcal gastas em 1 h.\n\n## Séries\n- Supino\n- Crucifixo" },
      links: [{ kind: "event" as const, id: "event-training", name: "Academia", eventKind: "training", at: "2026-09-14T10:00:00.000Z", endsAt: "2026-09-14T11:00:00.000Z" }],
      tags: ["saúde", "força"], revision: 1, createdAt: "2026-09-14T11:05:00.000Z", updatedAt: "2026-09-14T11:05:00.000Z",
    },
    {
      id: "note-task", name: "Ideias para a proposta", type: "text" as const, schemaVersion: 1,
      data: { body: "Começar pelo problema do cliente." },
      links: [{ kind: "task" as const, id: "task-proposal", name: "Revisar proposta", at: "2026-09-14T12:00:00.000Z" }],
      tags: ["trabalho"], revision: 3, createdAt: "2026-09-12T12:00:00.000Z", updatedAt: "2026-09-13T00:12:00.000Z",
    },
    {
      id: "note-loose", name: "Livros para ler", type: "text" as const, schemaVersion: 1,
      data: { body: "Torto arado." }, links: [],
      tags: [], revision: 1, createdAt: "2026-09-11T12:00:00.000Z", updatedAt: "2026-09-11T12:00:00.000Z",
    },
    {
      id: "note-sleep", name: "Sono", type: "sleep" as const, schemaVersion: 1,
      data: eventNotes.sleep.data, links: [{ kind: "event" as const, id: "event-sleep", name: "Dormir", eventKind: "sleep", at: "2026-09-13T23:00:00.000Z" }],
      tags: [], revision: 1, createdAt: "2026-09-14T07:00:00.000Z", updatedAt: "2026-09-14T07:00:00.000Z",
    },
  ]);
  writeFixture("create-note-input", mobileContractSchemas.createNoteInput, { type: "text" as const, data: { body: "Lista do mercado\n- Arroz" }, name: "Mercado", tags: ["casa"] });
  writeFixture("create-note-response", mobileContractSchemas.createNoteResponse, { noteId: "note-new" });
  writeFixture("update-note-input", mobileContractSchemas.updateNoteInput, {
    expectedRevision: 2, name: "Novo título", type: "text" as const, data: { body: "Texto novo" }, eventIds: [], taskIds: [], tags: ["casa"],
  });
  writeFixture("tag-suggestions", z.array(mobileContractSchemas.tagSuggestion), [{ id: "tag-1", name: "foco" }, { id: "tag-2", name: "saúde" }]);
  writeFixture("agent-chat-ticket", mobileContractSchemas.agentChatTicket, { ticket: "ticket_abc123", expiresAt: "2026-09-22T12:00:00.000Z" });
  writeFixture("agent-client-frames", z.array(mobileContractSchemas.agentChatClientFrame), [
    { type: "message", id: "frame-1", text: "O que tenho hoje?", context: { screen: "agenda", entityId: "2026-09-22" } },
    { type: "cancel", id: "frame-2" },
  ]);
  writeFixture("agent-server-frames", z.array(mobileContractSchemas.agentChatServerFrame), [
    { type: "ready", userId: "user-1", expiresAt: "2026-09-22T12:00:00.000Z" },
    { type: "status", id: "frame-1", label: "Consultando sua agenda" },
    {
      type: "reply", id: "frame-1", conversationId: "conversation-1", assistantSeq: 2,
      agentResponse: "Você tem um treino às oito.", entities: [{ kind: "event", id: "event-training", change: "updated", label: "Treino da manhã" }],
      createdEntities: [], updatedEntities: [{ kind: "event", id: "event-training", name: "Treino da manhã" }], deletedEntities: [],
    },
    { type: "error", id: "frame-2", code: "cancelled" },
  ]);
  writeFixture("agent-conversations", mobileContractSchemas.agentConversationPage, {
    items: [
      { id: "conversation-1", preview: "O que tenho hoje?", lastMessageAt: "2026-09-22T11:00:00.000Z", revision: 2, createdAt: "2026-09-22T10:00:00.000Z", updatedAt: "2026-09-22T11:00:00.000Z" },
      { id: "conversation-2", title: "Planejamento", preview: "Planejar a semana", lastMessageAt: "2026-09-21T18:00:00.000Z", revision: 1, createdAt: "2026-09-21T17:00:00.000Z", updatedAt: "2026-09-21T18:00:00.000Z" },
    ],
  });
  writeFixture("agent-messages", mobileContractSchemas.agentChatMessagePage, {
    items: [
      { id: "message-2", seq: 2, role: "assistant", content: "Você tem um treino às oito.", entities: [], createdAt: "2026-09-22T11:00:00.000Z" },
      { id: "message-1", seq: 1, role: "user", content: "O que tenho hoje?", entities: [], createdAt: "2026-09-22T10:59:00.000Z" },
    ],
  });

  const page = { items: timelineEvents, nextCursor: "cursor-2" };
  const grouped = groupEventsByDay(timelineEvents, "2026-09-22");
  writeFileSync(`${fixtureDirectory}timeline-parity.json`, `${JSON.stringify({
    dayKeys: timelineEvents.map((event) => ({ instant: event.startedAt, dayKey: dayKeyOf(event.startedAt) })),
    week: weekOf("2026-09-22"),
    grouped,
    merged: mergeTimelinePage([], page),
  }, null, 2)}\n`, "utf8");

  writeFileSync(`${fixtureDirectory}tag-colors-parity.json`, `${JSON.stringify(["foco", "saúde", "planejamento"].map((name) => ({
    name,
    hue: hueForTag(name),
    light: tagColors(name, lightTheme),
    dark: tagColors(name, darkTheme),
  })), null, 2)}\n`, "utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  generateFixtures();
  console.log(`Generated fixtures in ${fixtureDirectory}`);
}
