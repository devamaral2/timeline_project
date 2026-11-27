import type { TaskCardDto, TaskStatus } from "@repo/contracts";

/**
 * A hierarquia da lista de tarefas (`nestSubtasks`) e a regra de uma linha por série (`oneRowPerSeries`). Funções puras,
 * sem rede. As gavetas da lista moram em `task-drawers.ts`.
 */

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
