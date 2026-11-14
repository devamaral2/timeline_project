import type { EventCardDto, EventStatus } from "@repo/contracts";

/**
 * Agrupamento da lista de tarefas: os eventos com status da rota `tracked`
 * juntam pessoa e agente nos seis grupos do canvas. Função pura, sem rede.
 */

export type TaskGroupKey = "doing" | "todo" | "toDefine" | "waiting" | "done" | "closed";

export interface TaskGroup {
  key: TaskGroupKey;
  title: string;
  /** Feitas e Encerradas vêm recolhidos; abrem ao toque. */
  collapsedByDefault: boolean;
  /** Os cartões do grupo, na ordem em que a API os devolveu. */
  cards: EventCardDto[];
}

/** Cada status (de pessoa ou de agente) cai em exatamente um grupo. */
const groupOfStatus: Record<EventStatus, TaskGroupKey> = {
  doing: "doing",
  running: "doing",
  todo: "todo",
  queued: "todo",
  toDefine: "toDefine",
  inHold: "waiting",
  waiting: "waiting",
  done: "done",
  cancel: "closed",
  missed: "closed",
  failed: "closed",
};

const GROUPS: readonly Omit<TaskGroup, "cards">[] = [
  { key: "doing", title: "Em curso", collapsedByDefault: false },
  { key: "todo", title: "A fazer", collapsedByDefault: false },
  { key: "toDefine", title: "Sem data", collapsedByDefault: false },
  { key: "waiting", title: "Em espera", collapsedByDefault: false },
  { key: "done", title: "Feitas", collapsedByDefault: true },
  { key: "closed", title: "Encerradas", collapsedByDefault: true },
];

/**
 * Agrupa os cartões da lista. Uma subtarefa cujo pai também está na lista não
 * vira linha própria (o pai a representa). Cartão sem status (de referência)
 * fica de fora. Grupo vazio não é devolvido.
 */
export function groupTrackedEvents(cards: readonly EventCardDto[]): TaskGroup[] {
  const listed = new Set(cards.map((card) => card.id));
  const rows = cards.filter((card) => !card.parentEventIds.some((parent) => listed.has(parent)));

  return GROUPS.map((group) => ({
    ...group,
    cards: rows.filter((card) => card.status !== undefined && groupOfStatus[card.status] === group.key),
  })).filter((group) => group.cards.length > 0);
}

/** Status de pessoa em aberto: a série só mostra a ocorrência que ainda pede ação. */
const OPEN_STATUSES: ReadonlySet<EventStatus> = new Set<EventStatus>(["todo", "toDefine", "doing", "inHold"]);

/** Ocorrência que segue a série (não foi editada). Só ela é contada e aparece pela regra. */
function followsSeries(card: EventCardDto): boolean {
  return card.recurrence !== undefined && !card.recurrence.detached;
}

/** Na linha, a regra da série sai no lugar do horário quando a ocorrência segue a série. */
export function showsSeriesRule(card: EventCardDto): boolean {
  return followsSeries(card);
}

/**
 * Uma série aparece uma vez só: fica a ocorrência em aberto mais próxima
 * (menor `occurrenceOn`); sem nenhuma em aberto, a mais próxima de todas. Na
 * posição, a linha fica onde a ocorrência escolhida estava na lista. Cartão
 * sem série e ocorrência destacada passam sem mudança.
 */
export function oneRowPerSeries(cards: readonly EventCardDto[]): EventCardDto[] {
  const chosen = new Map<string, EventCardDto>();
  for (const card of cards) {
    if (!followsSeries(card) || !card.recurrence) continue;
    const seriesId = card.recurrence.id;
    const current = chosen.get(seriesId);
    if (!current || isPreferredOccurrence(card, current)) chosen.set(seriesId, card);
  }
  return cards.filter((card) => !followsSeries(card) || chosen.get(card.recurrence?.id ?? "") === card);
}

function isPreferredOccurrence(candidate: EventCardDto, current: EventCardDto): boolean {
  const candidateOpen = candidate.status !== undefined && OPEN_STATUSES.has(candidate.status);
  const currentOpen = current.status !== undefined && OPEN_STATUSES.has(current.status);
  if (candidateOpen !== currentOpen) return candidateOpen;
  return (candidate.recurrence?.occurrenceOn ?? "") < (current.recurrence?.occurrenceOn ?? "");
}

export interface SubtaskProgress {
  /** Subtarefas feitas (status `done`). */
  done: number;
  /** Todas as subtarefas da lista que apontam para o evento como pai. */
  total: number;
}

/**
 * A fração "1/3" de um evento: conta os cartões da lista cujo pai é o evento.
 * Sem subtarefas na lista, não há fração (devolve `undefined`).
 */
export function subtaskProgress(cards: readonly EventCardDto[], parentId: string): SubtaskProgress | undefined {
  const children = cards.filter((card) => card.parentEventIds.includes(parentId));
  if (children.length === 0) return undefined;
  return { done: children.filter((child) => child.status === "done").length, total: children.length };
}
