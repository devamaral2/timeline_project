import { z } from "zod";
import type { CreateEventInput } from "@repo/entities/contracts";

/**
 * Uma skill é uma capacidade que o agente pode acionar: descreve quando deve ser
 * usada, como preencher seus argumentos, e sabe traduzi-los em um CreateEventInput.
 *
 * As skills são puras de propósito — não conhecem o SDK do agente. Quem traduz
 * uma skill em uma tool do OpenRouter é a gateway em infra/.
 */
export interface EventSkill {
  /** Nome da tool exposta ao modelo. snake_case. */
  readonly name: string;
  /** Quando usar esta skill. É o que o agente lê para escolher entre elas. */
  readonly description: string;
  /** Guia detalhado (unidades, conversões, exemplos), injetado no system prompt. */
  readonly instructions: string;
  /** Schema dos argumentos, usado como inputSchema da tool. */
  readonly parameters: z.ZodObject;
  /** Valida os argumentos e os traduz. Lança ZodError se forem inválidos. */
  toCreateEventInput(args: unknown): CreateEventInput;
}

/**
 * Define uma skill com tipagem completa no ponto de definição, devolvendo o tipo
 * homogêneo que o registry precisa. A validação fica embutida: quem chama
 * `toCreateEventInput` recebe argumentos já validados ou um ZodError.
 */
export function defineEventSkill<TSchema extends z.ZodObject>(config: {
  name: string;
  description: string;
  instructions: string;
  parameters: TSchema;
  toCreateEventInput: (args: z.infer<TSchema>) => CreateEventInput;
}): EventSkill {
  return {
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    parameters: config.parameters,
    toCreateEventInput: (args: unknown) =>
      config.toCreateEventInput(config.parameters.parse(args) as z.infer<TSchema>),
  };
}

/** Campos aceitos por toda skill, espelhando CreateBaseEventInput. */
export const baseSkillFields = {
  description: z
    .string()
    .optional()
    .describe("Observação livre sobre o evento. Omita se o usuário não deu contexto extra."),
  tags: z
    .array(z.string())
    .optional()
    .describe("Etiquetas curtas em minúsculas, ex: ['corrida', 'manha']."),
};

/** Normaliza os campos base para o formato do CreateEventInput. */
export function toBaseEventInput(args: { description?: string; tags?: string[] }): {
  description?: string;
  tags?: string[];
} {
  return {
    ...(args.description ? { description: args.description } : {}),
    ...(args.tags?.length ? { tags: args.tags } : {}),
  };
}
