import { z } from "zod";
import type { ScopedSqlQuery, ScopedSqlScope } from "@repo/entities/ports";
import type { AgentChangeSession } from "../services/agent-change-session";

export interface AgentSkillContext {
  session: AgentChangeSession;
  query: ScopedSqlQuery;
  /** O mesmo escopo com que o prompt foi descrito: a ferramenta nao pode ver mais do que ele. */
  scope: ScopedSqlScope;
}

/**
 * Uma capacidade do agente: o que a ferramenta faz (description), como
 * preencher (instructions, no system prompt) e o schema dos argumentos. As
 * skills nao conhecem o SDK — quem as vira tools do OpenRouter e a gateway.
 */
export interface AgentSkill {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  /** O que o chat mostra enquanto a ferramenta roda ("Consultando seus dados"). */
  readonly progressLabel: string;
  readonly parameters: z.ZodObject;
  run(args: unknown, context: AgentSkillContext): Promise<unknown>;
}

export function defineAgentSkill<TSchema extends z.ZodObject>(config: {
  name: string;
  description: string;
  instructions: string;
  progressLabel: string;
  parameters: TSchema;
  run: (args: z.infer<TSchema>, context: AgentSkillContext) => Promise<unknown>;
}): AgentSkill {
  return {
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    progressLabel: config.progressLabel,
    parameters: config.parameters,
    // Erro vira resultado da ferramenta: o modelo corrige os argumentos na
    // rodada seguinte em vez de a requisicao inteira cair.
    run: async (args, context) => {
      const parsed = config.parameters.safeParse(args);
      if (!parsed.success) return fail(z.prettifyError(parsed.error));
      try {
        return await config.run(parsed.data, context);
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Data com fuso. `undefined` passa; texto que nao vira data e recusado. */
export function parseInstant(value: string | undefined, field: string): Date | undefined {
  if (value === undefined) return undefined;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error(`${field} inválido: ${value}`);
  return instant;
}

export const isoInstant = z
  .string()
  .describe("ISO-8601 com fuso, ex: 2026-09-16T07:30:00-03:00.");
