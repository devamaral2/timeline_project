import type { AgentChatTurn, AgentScreenContext } from "@repo/contracts";

export type AgentRoute =
  | { kind: "read" }
  | { kind: "single"; skill: "save_routine_event" | "save_meal_event" | "save_training_event" | "save_sleep_event" | "save_task" }
  | { kind: "complex" };

export interface AgentRouter {
  route(input: {
    text: string;
    context?: AgentScreenContext;
    history?: readonly AgentChatTurn[];
    now: Date;
    signal?: AbortSignal;
  }): Promise<AgentRoute>;
}
