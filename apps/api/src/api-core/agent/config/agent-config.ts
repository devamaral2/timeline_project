import { z } from "zod";
import agentsJson from "./agents.json";
import jevRoutingJson from "./jev-routing.json";
import promptsJson from "./prompts.json";
import skillsJson from "./skills.json";

/**
 * Ponto unico de leitura da configuracao do agente. Os JSONs desta pasta sao
 * validados na carga: um campo faltando ou uma skill inexistente derruba o
 * processo ao subir, e nao no meio do pedido de um usuario.
 */

const lines = z.array(z.string());
const choiceQuestion = z.object({
  type: z.literal("choice"),
  instructions: z.string(),
  criteria: z.record(z.string(), z.string()),
});

const jevRoutingSchema = z.object({
  endpoint: z.url(),
  model: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  minCertainty: z.number().min(0).max(1),
  historyTurns: z.number().int().nonnegative(),
  targetSkills: z.record(z.string(), z.string()),
  questions: z.object({ goal: choiceQuestion, count: choiceQuestion, target: choiceQuestion }),
});

const routeSchema = z.object({
  description: z.string(),
  readSkills: z.array(z.string()),
  writeSkills: z.union([z.array(z.string()), z.enum(["routed", "all"])]),
  prompt: z.enum(["read", "write"]),
});

const agentsSchema = z.object({
  routes: z.object({ read: routeSchema, single: routeSchema, complex: routeSchema }),
  limits: z.object({
    maxSteps: z.number().int().positive(),
    maxCostUsd: z.number().positive(),
    toolTimeoutMs: z.number().int().positive(),
    runTimeoutMs: z.number().int().positive(),
    maxToolResultChars: z.number().int().positive(),
    maxCommands: z.number().int().positive(),
    maxDayContextChars: z.number().int().positive(),
  }),
});

const skillsSchema = z.record(
  z.string(),
  z.object({ progressLabel: z.string(), description: z.string(), instructions: lines.min(1) }),
);

const promptsSchema = z.object({
  timeZone: z.string(),
  legacy: z.object({ beforeRules: lines, afterRules: lines, beforeSchema: lines, beforeSkills: lines }),
  rules: z.object({ singleRequest: lines, conversation: lines, chatMemory: lines }),
  routed: z.object({
    preamble: lines,
    guidelines: lines,
    readOnly: z.string(),
    writeContract: lines,
    tablesHeading: z.string(),
    skillsHeading: z.string(),
    jsonSchemaLabel: z.string(),
  }),
  screenContext: z.object({ none: z.string(), entitySuffix: z.string(), lines }),
  writeCheck: lines,
  finalResponseDirective: z.string(),
  responses: z.object({
    savingProgressLabel: z.string(),
    created: z.string(),
    createdSeries: z.string(),
    updatedSeries: z.string(),
    deletedSeries: z.string(),
    deletedSeriesNote: z.string(),
    updated: z.string(),
    rearranged: z.string(),
    deleted: z.string(),
    nothingToDo: z.string(),
    summaryFallback: z.string(),
  }),
});

export const jevRoutingConfig = jevRoutingSchema.parse(jevRoutingJson);
export const agentsConfig = agentsSchema.parse(agentsJson);
export const skillsConfig = skillsSchema.parse(skillsJson);
export const promptsConfig = promptsSchema.parse(promptsJson);

export type AgentRouteName = keyof typeof agentsConfig.routes;

/** Texto de uma skill: o que o modelo le sobre ela. Os argumentos (Zod) ficam no codigo da skill. */
export function skillText(name: string) {
  const entry = skillsConfig[name];
  if (!entry) throw new Error(`Skill sem entrada em config/skills.json: ${name}`);
  return {
    progressLabel: entry.progressLabel,
    description: entry.description,
    instructions: entry.instructions.join("\n"),
  };
}

/** Substitui `{{chave}}`; chave ausente e erro, para um typo no JSON nao virar texto solto no prompt. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Placeholder sem valor: {{${key}}}`);
    return value;
  });
}

for (const [route, spec] of Object.entries(agentsConfig.routes)) {
  const named = [...spec.readSkills, ...(Array.isArray(spec.writeSkills) ? spec.writeSkills : [])];
  for (const name of named) {
    if (!skillsConfig[name]) throw new Error(`agents.json › ${route}: skill sem entrada em skills.json: ${name}`);
  }
}
for (const [target, skill] of Object.entries(jevRoutingConfig.targetSkills)) {
  if (!skillsConfig[skill]) throw new Error(`jev-routing.json › targetSkills.${target}: skill sem entrada em skills.json: ${skill}`);
  if (!(target in jevRoutingConfig.questions.target.criteria)) {
    throw new Error(`jev-routing.json › targetSkills.${target} não existe em questions.target.criteria`);
  }
}
