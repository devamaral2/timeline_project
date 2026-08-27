import type { EventSkill } from "../skills/event-skill";

/**
 * Resultado de uma skill acionada pelo agente. Em caso de erro o texto volta ao
 * modelo como tool result, para que ele possa corrigir os argumentos e tentar de
 * novo — por isso o erro é um valor, e não uma exceção.
 */
export type SkillExecutionResult =
  | { ok: true; eventId: string }
  | { ok: false; error: string };

export interface EventAgentRunInput {
  text: string;
  systemPrompt: string;
  skills: readonly EventSkill[];
  execute: (call: { name: string; args: unknown }) => Promise<SkillExecutionResult>;
}

export interface EventAgentGateway {
  run(input: EventAgentRunInput): Promise<{ modelName: string }>;
}
