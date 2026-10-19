import type { AgentChatTurn, AgentScreenContext } from "@repo/contracts";

export type AgentRoute =
  | { kind: "read" }
  | { kind: "single"; skill: "save_routine_event" | "save_meal_event" | "save_training_event" | "save_sleep_event" | "save_task" | "save_recurrence" | "finish_event" }
  | { kind: "complex" };

export interface RouteJudgment {
  choice: string;
  confidence: number;
  probability: number;
}

/**
 * Por que o roteador decidiu o que decidiu. So numeros, nomes de opcao e
 * codigos: nada do texto do usuario. Alimenta a trilha de cada turno.
 */
export interface RouteDecision {
  source: "jev" | "none";
  latencyMs: number;
  model?: string;
  /** Presente quando o pedido foi para `complex` em vez de uma rota mais rapida. */
  fallbackReason?: string;
  goal?: RouteJudgment;
  count?: RouteJudgment;
  target?: RouteJudgment;
}

export interface AgentRouter {
  route(input: {
    text: string;
    context?: AgentScreenContext;
    history?: readonly AgentChatTurn[];
    now: Date;
    signal?: AbortSignal;
    /** Chamado uma vez por decisao, antes de `route` resolver. */
    onDecision?(decision: RouteDecision): void;
  }): Promise<AgentRoute>;
}
