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

const eventItems = {
  routine: {
    id: "item-routine",
    position: 0,
    type: "routine" as const,
    schemaVersion: 1,
    isPrimary: false,
    data: {},
  },
  meal: {
    id: "item-meal",
    position: 1,
    type: "meal" as const,
    schemaVersion: 1,
    isPrimary: false,
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
        micronutrients: { ironMg: 1.6 },
      }],
      totals: {
        totalCaloriesKcal: 152,
        totalProteinGrams: 5,
        totalCarbohydrateGrams: 27,
        totalFatGrams: 3,
        totalFiberGrams: 4,
      },
    },
  },
  sleep: {
    id: "item-sleep",
    position: 2,
    type: "sleep" as const,
    schemaVersion: 1,
    isPrimary: false,
    data: { trackedSleepTime: 7.5, score: 86 },
  },
  training: {
    id: "item-training",
    position: 3,
    type: "training" as const,
    schemaVersion: 1,
    isPrimary: true,
    data: {
      caloriesBurned: 450,
      workouts: [
        { id: "workout-treadmill", workoutCode: "treadmill" as const, workoutName: "Esteira", calories: 120, duration: 20, pace: 6.5, distance: 3.1 },
        { id: "workout-running", workoutCode: "running" as const, workoutName: "Corrida", calories: 170, duration: 25, pace: 5.8, distance: 4.3 },
        { id: "workout-weights", workoutCode: "weightlifting" as const, workoutName: "Força", calories: 130, duration: 30, sets: [{ id: "set-1", exercise: "Agachamento", repetitions: 10, weight: 40 }] },
        { id: "workout-free", workoutCode: "free" as const, workoutName: "Mobilidade", calories: 30, duration: 10 },
      ],
    },
  },
};

const timelineEvents = [
  {
    id: "event-training",
    primaryItemId: "item-training",
    primaryItemType: "training",
    itemTypes: ["training", "routine"],
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
    primaryItemId: "item-routine",
    primaryItemType: "routine",
    itemTypes: ["routine"],
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
  primaryItemId: "item-training",
  items: Object.values(eventItems),
};

const createEventInput = {
  name: "Novo bloco",
  tags: ["planejamento"],
  priority: "flexible" as const,
  items: [
    { type: "routine" as const },
    { type: "meal" as const, data: { inputText: "banana com iogurte" } },
    { type: "sleep" as const, data: { score: 80 } },
    { type: "training" as const, data: { workouts: [{ workoutCode: "free" }] } },
  ],
};

const updateEventInput = {
  eventId: "event-training",
  expectedRevision: 3,
  description: "Cardio, força e mobilidade",
  items: Object.values(eventItems).map(({ position: _position, ...item }) => item),
};

export function generateFixtures(): void {
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFixture("timeline-page", mobileContractSchemas.timelineEventPage, { items: timelineEvents, nextCursor: "cursor-2" });
  writeFixture("event-detail", mobileContractSchemas.eventDetail, eventDetail);
  writeFixture("create-event-input", mobileContractSchemas.createEventInput, createEventInput);
  writeFixture("update-event-input", mobileContractSchemas.updateEventInput, updateEventInput);
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
