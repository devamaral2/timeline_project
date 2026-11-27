import { isClosedStatus, isInProgressAgentStatus, isOpenAgentStatus } from "@repo/contracts";
import type { AgentTaskStatus, HumanTaskStatus, TaskCardDto, TaskSituation } from "@repo/contracts";

/**
 * As quatro gavetas da lista de tarefas, pela ação que a tarefa pede: Para agora, Contínuas, Para depois e
 * Finalizadas. Funções puras, sem rede. O trabalho que o agente ainda faz (`execution`) fica fora da lista: só a
 * gaveta de execução do shell o mostra. Os grupos de status de agente vêm de `@repo/contracts`, nunca de lista própria.
 */

/** As gavetas desenhadas na lista, na ordem da tela. */
export type ListDrawerKey = "now" | "continuous" | "later" | "ended";
export type DrawerKey = ListDrawerKey | "execution";

export interface TaskDrawer {
  key: ListDrawerKey;
  title: string;
  /** Para depois e Finalizadas vêm fechadas; abrem ao toque. */
  collapsedByDefault: boolean;
  /** Os cartões da gaveta: primeiro os de pessoa, depois os de agente, cada grupo na ordem recebida. */
  cards: TaskCardDto[];
}

const DRAWERS: readonly Omit<TaskDrawer, "cards">[] = [
  { key: "now", title: "Para agora", collapsedByDefault: false },
  { key: "continuous", title: "Contínuas", collapsedByDefault: false },
  { key: "later", title: "Para depois", collapsedByDefault: true },
  { key: "ended", title: "Finalizadas", collapsedByDefault: true },
];

/** A gaveta de cada status de pessoa. */
const HUMAN_DRAWER: Record<HumanTaskStatus, ListDrawerKey> = {
  todo: "now",
  doing: "now",
  toDefine: "later",
  inHold: "later",
  done: "ended",
  cancel: "ended",
  missed: "ended",
};

/** A gaveta de cada situação de um pedido de agente que terminou. */
const SITUATION_DRAWER: Record<TaskSituation, ListDrawerKey> = {
  to_review: "now",
  bookmarked: "later",
  reviewed: "ended",
};

/**
 * A gaveta de um cartão. Pedido de agente em andamento é `execution` (fora da lista); esperando a resposta é Para
 * agora; terminado vai pela situação (sem nenhuma, Finalizadas). A execução agendada é sempre Contínuas, com qualquer
 * status, assim como a tarefa longa de pessoa que ainda não acabou. Sem status (referência) não há gaveta.
 */
export function drawerOf(card: TaskCardDto): DrawerKey | null {
  if (card.status === undefined) return null;
  if (card.actor === "agent") {
    if (card.kind === "cron") return "continuous";
    const status = card.status as AgentTaskStatus;
    if (isInProgressAgentStatus(status)) return "execution";
    if (isOpenAgentStatus(status)) return "now";
    return card.situation ? SITUATION_DRAWER[card.situation] : "ended";
  }
  if (card.longRunning && !isClosedStatus("human", card.status)) return "continuous";
  return HUMAN_DRAWER[card.status as HumanTaskStatus];
}

/**
 * Os cartões que podem virar linha da lista: tira o trabalho em andamento do agente, que mora só na gaveta de execução.
 * Vai antes de `nestSubtasks`, para a subtarefa cuja principal está em andamento continuar como linha.
 */
export function listedCards(cards: readonly TaskCardDto[]): TaskCardDto[] {
  return cards.filter((card) => drawerOf(card) !== "execution");
}

/**
 * Reparte as linhas nas quatro gavetas, na ordem da tela. Em cada uma a pessoa vem antes do agente. Cartão em
 * andamento, sem status ou de gaveta vazia não é devolvido. Quem tira as subtarefas antes é `nestSubtasks`.
 */
export function drawersOf(cards: readonly TaskCardDto[]): TaskDrawer[] {
  return DRAWERS.map((drawer) => {
    const inDrawer = cards.filter((card) => drawerOf(card) === drawer.key);
    return {
      ...drawer,
      cards: [...inDrawer.filter((card) => card.actor !== "agent"), ...inDrawer.filter((card) => card.actor === "agent")],
    };
  }).filter((drawer) => drawer.cards.length > 0);
}

/** "5 tarefas para agora": a legenda em mono no topo da tela. */
export function toNowLabel(count: number): string {
  if (count === 0) return "Nenhuma tarefa para agora";
  return count === 1 ? "1 tarefa para agora" : `${count} tarefas para agora`;
}
