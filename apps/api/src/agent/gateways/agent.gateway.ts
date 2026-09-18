import type { z } from "zod";

/** Ferramenta ja presa ao contexto da requisicao (usuario, sessao de mudancas). */
export interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodObject;
  execute(args: unknown): Promise<unknown>;
}

export interface AgentRunInput {
  systemPrompt: string;
  text: string;
  tools: readonly AgentTool[];
  /** Abortado, a execucao para e a gateway lanca `AgentRunCancelledError`. */
  signal?: AbortSignal;
  /** Chamado antes de cada ferramenta rodar — e o progresso que o chat mostra. */
  onToolCall?(name: string): void;
}

export interface AgentRunResult {
  text: string;
  modelName: string;
  /** O loop parou num teto (passos, custo) e nao porque o modelo terminou. */
  stoppedByLimit: boolean;
}

export interface AgentGateway {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
