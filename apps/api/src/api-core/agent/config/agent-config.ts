import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import agentsJson from "./agents.json";
import jevRoutingJson from "./jev-routing.json";
import promptsJson from "./prompts.json";
import skillsJson from "./skills.json";

/**
 * Configuracao do agente. A versao ativa e lida na hora do uso (nao na carga do modulo), para que
 * uma publicacao na aplicacao valha no pedido seguinte, sem reiniciar (ADR 0002).
 *
 * Os JSONs deste pasta sao o padrao de fabrica: a primeira carga do banco sai deles, e a reversao
 * para o original sai deles tambem. Tudo e validado antes de virar a versao ativa; uma configuracao
 * invalida nunca chega a ser usada.
 */

const lines = z.array(z.string());
const choiceQuestion = z.object({
  type: z.literal("choice"),
  instructions: z.string(),
  criteria: z.record(z.string(), z.string()),
});

const jevRoutingSchema = z.object({
  endpoint: z.url(),
  /** Modelo nao e editavel pela aplicacao (decisao da entrevista): ver `PINNED_FIELDS`. */
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
  fast: z.object({
    plannerTimeoutMs: z.number().int().positive(),
    plannerAttemptMs: z.number().int().positive(),
    specialistTimeoutMs: z.number().int().positive(),
    specialistAttemptMs: z.number().int().positive(),
    maxOperations: z.number().int().positive(),
    skills: z.array(z.string()).min(1),
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
  fast: z.object({ planner: lines, specialist: lines, clarificationFallback: z.string() }),
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

export type AgentsConfig = z.infer<typeof agentsSchema>;
export type JevRoutingConfig = z.infer<typeof jevRoutingSchema>;
export type PromptsConfig = z.infer<typeof promptsSchema>;
export type SkillsConfig = z.infer<typeof skillsSchema>;

/** O que se edita e publica: os quatro arquivos, como JSON cru. */
export interface AgentConfigDocuments {
  agents: unknown;
  jevRouting: unknown;
  prompts: unknown;
  skills: unknown;
}

/** Uma versao ja validada, pronta para virar a ativa. */
export interface ActiveAgentConfig {
  agents: AgentsConfig;
  jevRouting: JevRoutingConfig;
  prompts: PromptsConfig;
  skills: SkillsConfig;
}

export type AgentRouteName = keyof AgentsConfig["routes"];

/** Padrao de fabrica: o que esta no repositorio. */
export const FACTORY_AGENT_CONFIG: AgentConfigDocuments = {
  agents: agentsJson,
  jevRouting: jevRoutingJson,
  prompts: promptsJson,
  skills: skillsJson,
};

/** Skills que so leem: rodam na hora, sem o envelope de comandos. Nunca entram na escrita. */
const READ_ONLY_SKILLS: readonly string[] = ["query_data", "get_day_context"];

/**
 * Chaves `{{x}}` que cada texto recebe de `fill`. Um typo numa edicao seria um erro em todo pedido que
 * usa o texto, entao e recusado na publicacao.
 */
const PLACEHOLDERS: ReadonlyArray<readonly [where: string, allowed: readonly string[], texts: (prompts: PromptsConfig) => string[]]> = [
  ["legacy.afterRules", ["now", "timeZone"], (prompts) => prompts.legacy.afterRules],
  ["routed.preamble", ["now", "timeZone"], (prompts) => prompts.routed.preamble],
  ["routed.jsonSchemaLabel", ["skill"], (prompts) => [prompts.routed.jsonSchemaLabel]],
  ["fast.planner", ["now", "nowIso", "timeZone"], (prompts) => prompts.fast.planner],
  ["fast.specialist", ["now", "nowIso", "timeZone", "skill", "skillInstructions"], (prompts) => prompts.fast.specialist],
  ["screenContext.entitySuffix", ["entityId"], (prompts) => [prompts.screenContext.entitySuffix]],
  ["screenContext.lines", ["screen", "entity"], (prompts) => prompts.screenContext.lines],
  ["writeCheck", ["previousAnswer"], (prompts) => prompts.writeCheck],
  ["responses.summaryFallback", ["created", "updated", "deleted"], (prompts) => [prompts.responses.summaryFallback]],
];

function checkPlaceholders(prompts: PromptsConfig): void {
  for (const [where, allowed, texts] of PLACEHOLDERS) {
    for (const text of texts(prompts)) {
      for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
        const key = match[1];
        if (key !== undefined && !allowed.includes(key)) {
          throw new Error(`prompts.json › ${where}: placeholder sem valor: {{${key}}} (aceitos: ${allowed.join(", ")})`);
        }
      }
    }
  }
}

/**
 * Valida os quatro documentos, as referencias entre eles, os placeholders dos textos e o que o codigo
 * assume das rotas (a consulta nao escreve; o destino de escrita nao e skill de leitura). `knownSkills`
 * (nomes das skills em codigo) e opcional: quando dado, o skills.json tem de ter exatamente essas skills,
 * nem uma a mais (sem codigo) nem uma a menos (sem texto: o pedido que a usa falharia).
 */
export function parseAgentConfig(documents: AgentConfigDocuments, knownSkills?: readonly string[]): ActiveAgentConfig {
  const agents = agentsSchema.parse(documents.agents);
  const jevRouting = jevRoutingSchema.parse(documents.jevRouting);
  const prompts = promptsSchema.parse(documents.prompts);
  const skills = skillsSchema.parse(documents.skills);
  // `Object.hasOwn`: um nome como "constructor" nao pode passar por entrada do prototipo.
  const hasSkill = (name: string) => Object.hasOwn(skills, name);
  const readOnly = new Set(READ_ONLY_SKILLS);

  for (const [route, spec] of Object.entries(agents.routes)) {
    const named = [...spec.readSkills, ...(Array.isArray(spec.writeSkills) ? spec.writeSkills : [])];
    for (const name of named) {
      if (!hasSkill(name)) throw new Error(`agents.json › ${route}: skill sem entrada em skills.json: ${name}`);
    }
    for (const name of spec.readSkills) {
      if (!readOnly.has(name)) {
        throw new Error(`agents.json › ${route}: readSkills só aceita skills de leitura (${READ_ONLY_SKILLS.join(", ")}): ${name}`);
      }
    }
  }
  if (!Array.isArray(agents.routes.read.writeSkills) || agents.routes.read.writeSkills.length > 0) {
    throw new Error("agents.json › read: a rota de consulta não pode ter skills de escrita");
  }
  for (const name of agents.fast.skills) {
    if (!hasSkill(name)) throw new Error(`agents.json › fast: skill sem entrada em skills.json: ${name}`);
    if (readOnly.has(name)) throw new Error(`agents.json › fast: skill de leitura não entra no fluxo de escrita: ${name}`);
  }
  for (const [target, skill] of Object.entries(jevRouting.targetSkills)) {
    if (!hasSkill(skill)) throw new Error(`jev-routing.json › targetSkills.${target}: skill sem entrada em skills.json: ${skill}`);
    if (readOnly.has(skill)) throw new Error(`jev-routing.json › targetSkills.${target}: skill de leitura não pode ser destino de escrita: ${skill}`);
    if (!(target in jevRouting.questions.target.criteria)) {
      throw new Error(`jev-routing.json › targetSkills.${target} não existe em questions.target.criteria`);
    }
  }
  checkPlaceholders(prompts);
  if (knownSkills) {
    for (const name of Object.keys(skills)) {
      if (!knownSkills.includes(name)) throw new Error(`skills.json: skill sem código correspondente: ${name}`);
    }
    for (const name of knownSkills) {
      if (!hasSkill(name)) throw new Error(`skills.json: skill com código e sem entrada: ${name}`);
    }
  }
  return { agents, jevRouting, prompts, skills };
}

const factory: ActiveAgentConfig = parseAgentConfig(FACTORY_AGENT_CONFIG);

/** Padrao de fabrica ja validado: o destino da restauracao e o que vale se o banco nao puder ser lido. */
export function factoryAgentConfig(): ActiveAgentConfig {
  return factory;
}

/**
 * Campos que a aplicacao nao edita (decisao da entrevista: so textos e limites). Valem sempre os do
 * padrao de fabrica; mudar um deles no repositorio vale no proximo deploy, e nao fica preso ao banco.
 */
const PINNED_FIELDS: ReadonlyArray<readonly [field: string, read: (config: ActiveAgentConfig) => unknown]> = [
  ["jevRouting.endpoint", (config) => config.jevRouting.endpoint],
  ["jevRouting.model", (config) => config.jevRouting.model],
  ["jevRouting.targetSkills", (config) => config.jevRouting.targetSkills],
  [
    "agents.routes (prompt, readSkills, writeSkills)",
    (config) =>
      Object.fromEntries(
        Object.entries(config.agents.routes).map(([name, spec]) => [
          name,
          { prompt: spec.prompt, readSkills: spec.readSkills, writeSkills: spec.writeSkills },
        ]),
      ),
  ],
  ["agents.fast.skills", (config) => config.agents.fast.skills],
];

/** Campos fixos em que a configuracao difere do padrao de fabrica. Vazio quando nenhum foi tocado. */
export function changedPinnedFields(config: ActiveAgentConfig): string[] {
  return PINNED_FIELDS.filter(([, read]) => !isDeepStrictEqual(read(config), read(factory))).map(([field]) => field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Devolve os documentos com os campos fixos (e o conjunto de skills) do padrao de fabrica e o resto como
 * estava. Serve a instantaneos gravados antes de um deploy que mudou o padrao: um modelo trocado no
 * repositorio, ou uma skill nova no codigo, vale sem apagar os textos que o dono editou. Opera no JSON
 * cru, porque o instantaneo antigo pode nem validar mais; quem recebe o resultado valida.
 */
export function withFactoryPins(documents: AgentConfigDocuments): AgentConfigDocuments {
  const agents = isRecord(documents.agents) ? structuredClone(documents.agents) : {};
  const jevRouting = isRecord(documents.jevRouting) ? structuredClone(documents.jevRouting) : {};
  const storedSkills = isRecord(documents.skills) ? documents.skills : {};
  const routes = isRecord(agents.routes) ? agents.routes : {};
  for (const [name, spec] of Object.entries(factory.agents.routes)) {
    const current = routes[name];
    routes[name] = {
      ...(isRecord(current) ? current : {}),
      prompt: spec.prompt,
      readSkills: [...spec.readSkills],
      writeSkills: Array.isArray(spec.writeSkills) ? [...spec.writeSkills] : spec.writeSkills,
    };
  }
  agents.routes = routes;
  agents.fast = { ...(isRecord(agents.fast) ? agents.fast : {}), skills: [...factory.agents.fast.skills] };
  return {
    ...documents,
    agents,
    jevRouting: {
      ...jevRouting,
      endpoint: factory.jevRouting.endpoint,
      model: factory.jevRouting.model,
      targetSkills: { ...factory.jevRouting.targetSkills },
    },
    // As skills existem em codigo: as do padrao de fabrica, e so elas. O texto e o que estava gravado.
    skills: Object.fromEntries(
      Object.entries(factory.skills).map(([name, entry]) => [
        name,
        structuredClone(Object.hasOwn(storedSkills, name) ? storedSkills[name] : entry),
      ]),
    ),
  };
}

let active: ActiveAgentConfig = factory;

/** A versao que o pedido em andamento fixou, se houver (ver `withConfigSnapshot`). */
const pinnedForRequest = new AsyncLocalStorage<ActiveAgentConfig>();

/**
 * Versao em uso agora: a que o pedido em andamento fixou ou, fora de um pedido, a ativa. Quem usa deve
 * ler aqui (ou pelas visoes vivas) na hora do uso, nunca guardar a referencia numa constante.
 */
export function activeAgentConfig(): ActiveAgentConfig {
  return pinnedForRequest.getStore() ?? active;
}

/**
 * Executa `run` lendo uma unica versao da configuracao, a ativa neste instante, do comeco ao fim,
 * inclusive depois de awaits. Uma publicacao que chegue no meio vale para o pedido seguinte, e nenhum
 * pedido pega uma versao pela metade (ADR 0002). Dentro de outro `withConfigSnapshot`, mantem a do
 * pedido de fora.
 */
export function withConfigSnapshot<T>(run: () => T): T {
  return pinnedForRequest.getStore() ? run() : pinnedForRequest.run(active, run);
}

/** Troca a versao ativa. Recebe so o que ja foi validado por `parseAgentConfig`. */
export function activateAgentConfig(config: ActiveAgentConfig): void {
  active = config;
}

/** Visao viva de um pedaco da versao em uso: le a cada acesso, para que a troca valha sem reinicio. */
function live<T extends object>(read: () => T): T {
  return new Proxy({} as T, {
    get: (_target, key) => Reflect.get(read(), key),
    has: (_target, key) => Reflect.has(read(), key),
    ownKeys: () => Reflect.ownKeys(read()),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(read(), key);
      return descriptor && { ...descriptor, configurable: true };
    },
  });
}

export const agentsConfig: AgentsConfig = live(() => activeAgentConfig().agents);
export const jevRoutingConfig: JevRoutingConfig = live(() => activeAgentConfig().jevRouting);
export const promptsConfig: PromptsConfig = live(() => activeAgentConfig().prompts);
export const skillsConfig: SkillsConfig = live(() => activeAgentConfig().skills);

/** Texto de uma skill: o que o modelo le sobre ela. Os argumentos (Zod) ficam no codigo da skill. */
export function skillText(name: string) {
  const entry = activeAgentConfig().skills[name];
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
