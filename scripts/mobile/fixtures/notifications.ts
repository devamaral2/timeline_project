/**
 * Fixtures dos lembretes: o cálculo do web (`due-notifications.ts`) e o rótulo do deslocamento
 * (`notificationOffsetLabel`), cada caso com a entrada e o que a função TS devolveu. As tarefas são cartões
 * validados pelo schema do contrato; o teste Kotlin os decodifica pelo DTO do app e confere o port contra estes
 * resultados. As respostas de `GET /api/tasks` e `GET /api/tasks/tracked` dos testes de rede saem das mesmas tarefas.
 */
import { agendaPageSchema, taskCardSchema } from "../../../packages/contracts/src/schemas";
import {
  CATCH_UP_WINDOW_MS,
  dueNotificationsOf,
  kindOf,
  notificationFeedOf,
  notificationAnchorOf,
  notificationKeyOf,
} from "../../../apps/web/src/lib/notifications/due-notifications";
import { notificationOffsetLabel } from "../../../apps/web/src/components/tasks/task-visuals";

type Case = { args: unknown[]; result: unknown };

function cases<Args extends unknown[]>(fn: (...args: Args) => unknown, inputs: Args[]): Case[] {
  return inputs.map((args) => ({ args, result: fn(...args) }));
}

type CardInput = Record<string, unknown> & { id: string; name: string };

export function reminderCard(input: CardInput) {
  return taskCardSchema.parse({
    actor: "human",
    kind: "common",
    priority: "medium",
    description: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...input,
  });
}

/** 14 de setembro de 2026, 12:00 em São Paulo. */
export const REMINDER_NOW = "2026-09-14T15:00:00.000Z";

/** Cada tarefa isola uma regra: status, tarefa longa, tarefa de referência, sem data e deslocamentos que se cruzam. */
export const reminderCards = [
  reminderCard({ id: "meeting", name: "Reunião de planejamento", status: "todo", startedAt: "2026-09-14T18:00:00.000Z", estimatedFinishAt: "2026-09-14T19:00:00.000Z", notifyOffsetsMinutes: [5, 30, 60, 1440] }),
  reminderCard({ id: "project", name: "Entrega do projeto", status: "doing", longRunning: true, startedAt: "2026-09-01T12:00:00.000Z", estimatedFinishAt: "2026-09-16T12:00:00.000Z", notifyOffsetsMinutes: [60, 2880] }),
  reminderCard({ id: "bill", name: "Pagar o condomínio", startedAt: "2026-09-15T13:00:00.000Z", notifyOffsetsMinutes: [15] }),
  reminderCard({ id: "finished", name: "Almoço", status: "done", startedAt: "2026-09-14T16:00:00.000Z", notifyOffsetsMinutes: [10] }),
  reminderCard({ id: "cancelled", name: "Treino", kind: "training", status: "cancel", startedAt: "2026-09-14T16:00:00.000Z", notifyOffsetsMinutes: [10] }),
  reminderCard({ id: "no-date", name: "Ideia sem data", status: "toDefine", notifyOffsetsMinutes: [10] }),
  reminderCard({ id: "long-no-deadline", name: "Estudar sempre", status: "doing", longRunning: true, startedAt: "2026-09-01T12:00:00.000Z", notifyOffsetsMinutes: [10] }),
  reminderCard({ id: "agent", name: "Buscar passagens", actor: "agent", kind: "search_request", status: "queued", startedAt: "2026-09-14T17:00:00.000Z", notifyOffsetsMinutes: [10] }),
  reminderCard({ id: "plain", name: "Sem aviso", status: "todo", startedAt: "2026-09-14T17:00:00.000Z" }),
  reminderCard({ id: "month-out", name: "Declarar imposto", status: "todo", startedAt: "2026-10-30T12:00:00.000Z", notifyOffsetsMinutes: [43200, 1] }),
];

const MINUTE = 60_000;
const MEETING = Date.parse("2026-09-14T18:00:00.000Z");

/** Instantes ao redor dos horários de aviso da reunião (18h) e da entrega longa, nas bordas da janela de 1 h. */
const NOWS = [
  MEETING - 1441 * MINUTE,
  MEETING - 1440 * MINUTE,
  MEETING - 1440 * MINUTE + 59 * MINUTE,
  MEETING - 1440 * MINUTE + 60 * MINUTE,
  MEETING - 1440 * MINUTE + 60 * MINUTE + 1,
  MEETING - 61 * MINUTE,
  MEETING - 60 * MINUTE,
  MEETING - 60 * MINUTE + 59 * MINUTE,
  MEETING - 30 * MINUTE,
  MEETING - 6 * MINUTE,
  MEETING - 5 * MINUTE,
  MEETING - 1,
  MEETING,
  MEETING + 61 * MINUTE,
  Date.parse("2026-09-14T09:00:00.000Z"),
  Date.parse("2026-09-15T12:00:00.000Z"),
  Date.parse("2026-09-16T11:30:00.000Z"),
  Date.parse("2026-09-16T12:00:00.000Z"),
  Date.parse("2026-10-30T12:00:00.000Z") - 43200 * MINUTE,
  Date.parse("2026-10-30T12:00:00.000Z") - 43200 * MINUTE - 1,
].map((ms) => new Date(ms).toISOString());

/** O feed do chat: os instantes acima mais os que mostram o que já começou, a borda das 24 h e o limite de cinco próximos. */
const FEED_NOWS = [
  ...NOWS,
  MEETING + 30 * MINUTE,
  MEETING + 24 * 60 * MINUTE,
  MEETING + 24 * 60 * MINUTE + MINUTE,
  Date.parse("2026-09-01T00:00:00.000Z"),
  Date.parse("2026-09-18T12:00:00.000Z"),
].map((now) => (typeof now === "string" ? now : new Date(now).toISOString()));

const FIRED_VARIANTS: string[][] = [
  [],
  ["meeting:2026-09-14T18:00:00.000Z:30"],
  ["meeting:2026-09-14T18:00:00.000Z:30", "meeting:2026-09-14T18:00:00.000Z:5", "project:2026-09-16T12:00:00.000Z:60"],
];

export function notificationsFixtures(): Record<string, unknown> {
  return {
    "notifications-cases": {
      catchUpWindowMs: CATCH_UP_WINDOW_MS,
      cards: reminderCards,
      anchorOf: cases((id: string) => notificationAnchorOf(reminderCards.find((card) => card.id === id) as never) ?? null, reminderCards.map((card) => [card.id])),
      keyOf: cases(
        (id: string, offset: number) => notificationKeyOf(reminderCards.find((card) => card.id === id) as never, offset),
        [["meeting", 5], ["meeting", 1440], ["project", 60], ["bill", 15], ["finished", 10], ["no-date", 10]],
      ),
      kindOf: cases((id: string) => kindOf(reminderCards.find((card) => card.id === id) as never), reminderCards.map((card) => [card.id])),
      /** `args` = [ids das tarefas, instante, chaves já disparadas]; a saída traz `settled` com o instante de referência em ms. */
      dueNotificationsOf: cases(
        (ids: string[], now: string, fired: string[]) =>
          dueNotificationsOf(
            ids.map((id) => reminderCards.find((card) => card.id === id) as never),
            Date.parse(now),
            new Set(fired),
          ),
        NOWS.flatMap((now) => FIRED_VARIANTS.map((fired) => [reminderCards.map((card) => card.id), now, fired] as [string[], string, string[]])),
      ),
      /** `args` = [ids das tarefas, instante (já no minuto, como o web o entrega)]; a saída é `{ recent, upcoming }`. */
      feedOf: cases(
        (ids: string[], now: string) =>
          notificationFeedOf(
            ids.map((id) => reminderCards.find((card) => card.id === id) as never),
            Date.parse(now),
          ),
        FEED_NOWS.map((now) => [reminderCards.map((card) => card.id), now] as [string[], string]),
      ),
      offsetLabel: cases(notificationOffsetLabel, [[1], [5], [30], [60], [90], [1440], [2880], [4320], [43200], [1441]]),
    },
    /** `GET /api/tasks` e `GET /api/tasks/tracked` com a tarefa `meeting` nas duas listas (a agenda vence) e uma só de cada lado. */
    "notifications-agenda-page": agendaPageSchema.parse({ items: [reminderCards[0], reminderCards[2]] }),
    /** A reunião remarcada para as 19:00Z; o condomínio já não está na janela. */
    "notifications-agenda-rescheduled": agendaPageSchema.parse({
      items: [reminderCard({ ...reminderCards[0], startedAt: "2026-09-14T19:00:00.000Z", estimatedFinishAt: "2026-09-14T20:00:00.000Z", revision: 2 })],
    }),
    /** Sem tarefa nenhuma nas duas listas: o feed vazio. */
    "notifications-agenda-empty": agendaPageSchema.parse({ items: [] }),
    "notifications-tracked-empty": [],
    "notifications-tracked": [reminderCards[0], reminderCards[1]].map((card) => taskCardSchema.parse(card)),
  };
}
