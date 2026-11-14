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
