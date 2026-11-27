/**
 * Fixtures das tarefas da agenda: as respostas de `GET /api/tasks` validadas
 * pelo schema do contrato e as saídas das funções do web que a agenda usa
 * (`isAgendaCard`, `agendaTasksByDay`, `cardWhenLabel`, `cardDurationLabel`,
 * `cardIsOverdue`, `elapsedLabel`). O resumo do dia (`daySummary`) fica de fora: no celular o web esconde a barra que o mostra.
 */
import { agendaPageSchema, taskCardSchema } from "../../../packages/contracts/src/schemas";
import { dayKeyOf, zonedDayEnd, zonedDayStart, weekOf } from "../../../packages/timeline/src/index";
import { agendaTasksByDay, isAgendaCard } from "../../../apps/web/src/components/agenda/agenda-data";
import { hasOpenAgentTask } from "../../../apps/web/src/lib/tasks/agent-request-model";
import { humanStatusOptions, statusPatch } from "../../../apps/web/src/lib/tasks/task-read-model";
import { cardDurationLabel, cardIsOverdue, cardWhenLabel, elapsedLabel } from "../../../apps/web/src/lib/tasks/card-text";
import { AGENT_SKILLS_PROJECT, PERSONAL_PROJECT, TIMELINE_PROJECT } from "./project";

/** 14 de setembro de 2026, 12:00 em São Paulo: uma segunda-feira. */
export const NOW = "2026-09-14T15:00:00.000Z";

type CardInput = Record<string, unknown> & { id: string; name: string };

function card(input: CardInput) {
  return taskCardSchema.parse({
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
    ...input,
  });
}

const cards = [
  card({ id: "task-1", name: "Reunião de planejamento", project: TIMELINE_PROJECT, status: "todo", startedAt: "2026-09-14T12:00:00.000Z", estimatedFinishAt: "2026-09-14T12:50:00.000Z", tags: ["trabalho", "saúde"] }),
  card({ id: "task-2", name: "Almoço", kind: "meal", status: "done", startedAt: "2026-09-14T15:00:00.000Z", estimatedFinishAt: "2026-09-14T16:30:00.000Z", tags: ["casa"] }),
  card({ id: "task-3", name: "Buscar passagens", project: AGENT_SKILLS_PROJECT, actor: "agent", kind: "search_request", status: "running", startedAt: "2026-09-14T14:48:00.000Z" }),
  card({ id: "task-4", name: "Montar relatório", actor: "agent", kind: "build_request", status: "queued", startedAt: "2026-09-14T14:57:00.000Z" }),
  card({ id: "task-5", name: "Qual hotel prefere?", actor: "agent", kind: "inquiry_request", status: "waiting", startedAt: "2026-09-14T13:00:00.000Z" }),
  card({ id: "task-6", name: "Dormir", kind: "sleep", status: "doing", startedAt: "2026-09-15T01:00:00.000Z", estimatedFinishAt: "2026-09-15T09:00:00.000Z" }),
  card({ id: "task-7", name: "Projeto longo", status: "doing", longRunning: true, startedAt: "2026-09-01T12:00:00.000Z", estimatedFinishAt: "2026-11-30T12:00:00.000Z", tags: ["trabalho"] }),
  card({ id: "task-8", name: "Passo da pesquisa", actor: "agent", kind: "step", status: "completed", startedAt: "2026-09-14T14:00:00.000Z" }),
  card({ id: "task-9", name: "Pagar o condomínio", status: undefined, revision: 4, startedAt: "2026-09-14T03:00:00.000Z" }),
  card({ id: "task-10", name: "Ligar para o banco", status: "todo", startedAt: "2026-09-13T15:00:00.000Z", estimatedFinishAt: "2026-09-13T15:15:00.000Z" }),
  card({ id: "task-11", name: "Devolver o livro", status: "todo", startedAt: "2026-09-11T15:00:00.000Z" }),
  card({ id: "task-12", name: "Ideia sem data", status: "toDefine" }),
  card({ id: "task-13", name: "Declarar imposto", status: "todo", longRunning: true, startedAt: "2026-08-01T12:00:00.000Z", estimatedFinishAt: "2026-09-10T12:00:00.000Z" }),
  card({ id: "task-14", name: "Treino de amanhã", kind: "training", status: "todo", startedAt: "2026-09-15T11:00:00.000Z", tags: ["saúde"] }),
  card({ id: "task-15", name: "Backup falhou", actor: "agent", kind: "cron", status: "failed", startedAt: "2026-09-14T02:00:00.000Z" }),
  card({ id: "task-16", name: "Resumo pronto", actor: "agent", kind: "review_request", status: "completed", startedAt: "2026-09-12T15:00:00.000Z" }),
  card({ id: "task-17", name: "Jantar até a meia-noite", kind: "meal", status: "todo", startedAt: "2026-09-15T01:00:00.000Z", estimatedFinishAt: "2026-09-15T03:00:00.000Z" }),
  card({ id: "task-18", name: "Prova de 1h30", status: "todo", startedAt: "2026-09-16T12:00:00.000Z", estimatedFinishAt: "2026-09-16T13:30:00.000Z" }),
  card({ id: "task-19", name: "Pedido cancelado", actor: "agent", kind: "request", status: "cancelled", startedAt: "2026-09-14T10:00:00.000Z" }),
  card({ id: "task-20", name: "Em espera", status: "inHold", startedAt: "2026-09-17T12:00:00.000Z", estimatedFinishAt: "2026-09-17T14:00:00.000Z" }),
];

/** O conteúdo guardado: a página da extensão e o vídeo à espera do serviço local. Têm horário e nunca entram na agenda (ADR 0021). */
const SAVED_CONTENT_CARDS = [
  card({ id: "task-21", name: "Página guardada", actor: "agent", kind: "save_content", status: "done", startedAt: "2026-09-14T13:30:00.000Z" }),
  card({ id: "task-22", name: "Vídeo guardado", actor: "agent", kind: "save_content_with_transcription", status: "awaiting_transcription", startedAt: "2026-09-14T14:10:00.000Z" }),
];
const GROUPING_CARDS = [...cards, ...SAVED_CONTENT_CARDS];

/** As tarefas que o servidor devolveria para a semana de 13 a 19 de setembro, em duas páginas com um cartão repetido. */
const WEEK_CARDS = cards.filter((item) => item.id !== "task-12" && item.id !== "task-16" && item.id !== "task-11" && item.id !== "task-7");
const pageOne = WEEK_CARDS.slice(0, 6);
const pageTwo = [WEEK_CARDS[2], ...WEEK_CARDS.slice(6)];

const HUMAN_STATUSES = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"] as const;
const AGENT_STATUSES = [
  "preparing", "queued", "starting", "running", "waiting", "awaiting_transcription", "completed", "interrupted", "failed", "cancelled", "rolled_back",
] as const;
const STATUS_NOW = new Date("2026-09-14T15:30:45.123Z");

/** A tarefa de referência da agenda depois que outro lugar a mudou: a releitura que o conflito e o sucesso trazem. */
function referenceCard(status: string, revision: number) {
  return card({ id: "task-9", name: "Pagar o condomínio", status, revision, startedAt: "2026-09-14T03:00:00.000Z" });
}

export function tasksFixtures(): Record<string, unknown> {
  const weekDays = weekOf("2026-09-14");
  return {
    "tasks-agenda-page-1": agendaPageSchema.parse({ items: pageOne, nextCursor: "cursor-1" }),
    "tasks-agenda-page-2": agendaPageSchema.parse({ items: pageTwo }),
    /** Cartões de agente com a escolha de modelo do pedido (um por provedor) e sem ela: a linha só desenha o provedor quando o cartão a traz. */
    "tasks-agent-model": agendaPageSchema.parse({
      items: [
        card({ id: "model-anthropic", name: "Com a Anthropic", actor: "agent", kind: "search_request", status: "running", startedAt: "2026-09-14T14:48:00.000Z", model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" } }),
        card({ id: "model-openai", name: "Com a OpenAI", actor: "agent", kind: "build_request", status: "completed", startedAt: "2026-09-14T14:00:00.000Z", model: { provider: "openai", model: "gpt-6.2-sol", effort: "high" } }),
        card({ id: "model-openrouter", name: "Com o OpenRouter", actor: "agent", kind: "request", status: "queued", startedAt: "2026-09-14T14:57:00.000Z", model: { provider: "openrouter", model: "google/gemini-4-neon", effort: "low" } }),
        card({ id: "model-none", name: "Sem escolha de modelo", actor: "agent", kind: "request", status: "failed", startedAt: "2026-09-14T13:00:00.000Z" }),
      ],
    }),
    "tasks-agenda-empty": agendaPageSchema.parse({ items: [] }),
    "tasks-agenda-reference-doing": agendaPageSchema.parse({ items: [referenceCard("doing", 5)] }),
    "tasks-agenda-reference-done": agendaPageSchema.parse({ items: [referenceCard("done", 5)] }),
    /** A semana depois que o agente terminou o que estava aberto. */
    "tasks-agenda-agents-finished": agendaPageSchema.parse({
      items: [card({ id: "task-3", name: "Buscar passagens", actor: "agent", kind: "search_request", status: "completed", startedAt: "2026-09-14T14:48:00.000Z" })],
    }),
    /** As saídas de `statusPatch`, `humanStatusOptions` e `hasOpenAgentTask` do web, para todas as entradas que importam. */
    "tasks-status-change": {
      now: STATUS_NOW.toISOString(),
      patches: [null, ...HUMAN_STATUSES].flatMap((from) =>
        HUMAN_STATUSES.map((to) => ({
          from,
          to,
          revision: 4,
          patch: statusPatch({ revision: 4, status: from ?? undefined }, to, STATUS_NOW),
        })),
      ),
      options: [false, true].map((longRunning) => ({ longRunning, statuses: humanStatusOptions({ longRunning }) })),
      openAgent: [
        ...AGENT_STATUSES.map((status) => ({ actor: "agent", status, open: hasOpenAgentTask([{ actor: "agent", status } as never]) })),
        ...HUMAN_STATUSES.map((status) => ({ actor: "human", status, open: hasOpenAgentTask([{ actor: "human", status } as never]) })),
        { actor: "human", status: null, open: hasOpenAgentTask([{ actor: "human" } as never]) },
      ],
    },
    "tasks-agenda-window": {
      now: NOW,
      todayKey: dayKeyOf(NOW),
      weekDays,
      from: zonedDayStart(weekDays[0] as string).toISOString(),
      to: zonedDayEnd(weekDays[6] as string).toISOString(),
      /** O que a agenda mostra em cada dia da semana, em ids, pelas regras do web. */
      idsByDay: Object.fromEntries(
        Object.entries(agendaTasksByDay(WEEK_CARDS)).map(([day, tasks]) => [day, tasks.map((task) => task.id)]),
      ),
      pageOneIds: pageOne.map((item) => item.id),
      pageTwoIds: pageTwo.map((item) => item.id),
    },
    "tasks-agenda-grouping": {
      cards: GROUPING_CARDS,
      agendaCardIds: GROUPING_CARDS.filter(isAgendaCard).map((item) => item.id),
      idsByDay: Object.fromEntries(Object.entries(agendaTasksByDay(GROUPING_CARDS)).map(([day, tasks]) => [day, tasks.map((task) => task.id)])),
    },
    "tasks-card-text": {
      now: NOW,
      cards: GROUPING_CARDS,
      expected: GROUPING_CARDS.map((item) => ({
        id: item.id,
        when: cardWhenLabel(item, new Date(NOW)),
        overdue: cardIsOverdue(item, new Date(NOW)),
        duration: cardDurationLabel(item),
      })),
      elapsed: [
        "2026-09-14T15:00:00.000Z", "2026-09-14T14:59:30.000Z", "2026-09-14T14:48:00.000Z", "2026-09-14T13:00:00.000Z",
        "2026-09-13T15:00:00.000Z", "2026-09-12T14:00:00.000Z", "2026-09-14T15:10:00.000Z",
      ].map((instant) => ({ instant, result: elapsedLabel(instant, new Date(NOW)) })),
    },
  };
}
