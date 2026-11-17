import type { TaskCardDto, TaskStatus } from "@repo/contracts";

/**
 * Agrupamento da lista de tarefas: as tarefas com status da rota `tracked`
 * juntam pessoa e agente nos seis grupos do canvas. Função pura, sem rede.
 */

export type TaskGroupKey = "doing" | "todo" | "toDefine" | "waiting" | "done" | "closed";

export interface TaskGroup {
  key: TaskGroupKey;
  title: string;
  /** Feitas e Encerradas vêm recolhidos; abrem ao toque. */
  collapsedByDefault: boolean;
  /** Os cartões do grupo, na ordem em que a API os devolveu. */
  cards: TaskCardDto[];
}

/** Cada status (de pessoa ou de agente) cai em exatamente um grupo. */
const groupOfStatus: Record<TaskStatus, TaskGroupKey> = {
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
 * Agrupa os cartões da lista: cada cartão com status recebido vira uma linha do
 * seu grupo. Quem tira as subtarefas antes é `nestSubtasks`. Cartão sem status
 * (de referência) fica de fora. Grupo vazio não é devolvido.
 */
export function groupTrackedTasks(cards: readonly TaskCardDto[]): TaskGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    cards: cards.filter((card) => card.status !== undefined && groupOfStatus[card.status] === group.key),
  })).filter((group) => group.cards.length > 0);
}

export interface SubtaskTree {
  /** Os cartões que viram linha da lista, na ordem recebida. */
  roots: TaskCardDto[];
  /** As subtarefas diretas de uma tarefa da lista, na ordem recebida (vazio quando não tem). */
  subtasksOf(taskId: string): TaskCardDto[];
}

/**
 * A hierarquia da lista (ADR 0017): a subtarefa cuja principal está na lista sai
 * das linhas e vai para dentro dela; a subtarefa de uma subtarefa fica dentro da
 * sua principal direta. Sem a principal na lista (filtro, modo, tarefa sem
 * status), a subtarefa continua linha, para não sumir. Um ciclo vindo da rede
 * também não esconde ninguém.
 */
export function nestSubtasks(cards: readonly TaskCardDto[]): SubtaskTree {
  const byId = new Map(cards.map((card) => [card.id, card]));
  /** Sobe pelas principais: só se aninha quem chega a uma raiz sem repetir ninguém. */
  function reachesRoot(card: TaskCardDto): boolean {
    const seen = new Set<string>([card.id]);
    let current = card;
    while (current.parentTaskId && byId.has(current.parentTaskId)) {
      if (seen.has(current.parentTaskId)) return false;
      seen.add(current.parentTaskId);
      current = byId.get(current.parentTaskId) as TaskCardDto;
    }
    return true;
  }
  const children = new Map<string, TaskCardDto[]>();
  const roots: TaskCardDto[] = [];
  for (const card of cards) {
    const parentId = card.parentTaskId;
    if (parentId && byId.has(parentId) && reachesRoot(card)) {
      children.set(parentId, [...(children.get(parentId) ?? []), card]);
    } else {
      roots.push(card);
    }
  }
  return { roots, subtasksOf: (taskId) => children.get(taskId) ?? [] };
}

/** Status de pessoa em aberto: a série só mostra a ocorrência que ainda pede ação. */
const OPEN_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["todo", "toDefine", "doing", "inHold"]);

/** Ocorrência que segue a série (não foi editada). Só ela é contada e aparece pela regra. */
function followsSeries(card: TaskCardDto): boolean {
  return card.recurrence !== undefined && !card.recurrence.detached;
}

/** Na linha, a regra da série sai no lugar do horário quando a ocorrência segue a série. */
export function showsSeriesRule(card: TaskCardDto): boolean {
  return followsSeries(card);
}

/**
 * Uma série aparece uma vez só: fica a ocorrência em aberto mais próxima
 * (menor `occurrenceOn`); sem nenhuma em aberto, a mais próxima de todas. Na
 * posição, a linha fica onde a ocorrência escolhida estava na lista. Cartão
 * sem série e ocorrência destacada passam sem mudança.
 */
export function oneRowPerSeries(cards: readonly TaskCardDto[]): TaskCardDto[] {
  const chosen = new Map<string, TaskCardDto>();
  for (const card of cards) {
    if (!followsSeries(card) || !card.recurrence) continue;
    const seriesId = card.recurrence.id;
    const current = chosen.get(seriesId);
    if (!current || isPreferredOccurrence(card, current)) chosen.set(seriesId, card);
  }
  return cards.filter((card) => !followsSeries(card) || chosen.get(card.recurrence?.id ?? "") === card);
}

function isPreferredOccurrence(candidate: TaskCardDto, current: TaskCardDto): boolean {
  const candidateOpen = candidate.status !== undefined && OPEN_STATUSES.has(candidate.status);
  const currentOpen = current.status !== undefined && OPEN_STATUSES.has(current.status);
  if (candidateOpen !== currentOpen) return candidateOpen;
  return (candidate.recurrence?.occurrenceOn ?? "") < (current.recurrence?.occurrenceOn ?? "");
}
