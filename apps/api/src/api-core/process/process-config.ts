import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import dispatchJson from "./jev/dispatch.json";
import candidatesJson from "./jev/candidates.json";
import linkJson from "./jev/link.json";
import uiJson from "./ui.json";

/**
 * Ponto unico de leitura da configuracao da rota por processo. Os JSONs (parametros do JEV e textos)
 * e os `.md` (um por agente) sao validados na carga: arquivo quebrado derruba o processo ao subir,
 * e nao no meio do pedido de um usuario.
 */

const choiceQuestion = z.object({
  type: z.literal("choice"),
  instructions: z.string().min(1),
  criteria: z.record(z.string(), z.string()),
});
export type ChoiceQuestion = z.infer<typeof choiceQuestion>;

const jevBase = {
  endpoint: z.url(),
  model: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  minCertainty: z.number().min(0).max(1),
};

const dispatchSchema = z.object({
  ...jevBase,
  uncertainPolicy: z.enum(["fallback", "ignore"]),
  questions: z.record(z.string(), choiceQuestion),
});

const linkSchema = z.object({
  ...jevBase,
  maxCandidates: z.number().int().positive(),
  question: z.object({ instructions: z.string().min(1), none: z.string().min(1) }),
});

const candidatesSchema = z.object({
  ...jevBase,
  question: z.object({ instructions: z.string().min(1), criteria: z.record(z.string(), z.string()) }),
});

const uiSchema = z.object({
  title: z.string().min(1),
  steps: z.record(z.string(), z.string().min(1)),
  failure: z.string().includes("{{label}}"),
  dispatchFailed: z.string().min(1),
  /** O alvo da edicao pela tela de detalhe nao pode ser editado (ADR 006). */
  targetFailed: z.object({ not_found: z.string().min(1), type_mismatch: z.string().min(1), busy: z.string().min(1) }),
});

export const dispatchConfig = dispatchSchema.parse(dispatchJson);
export const linkConfig = linkSchema.parse(linkJson);
export const candidatesConfig = candidatesSchema.parse(candidatesJson);
export const uiConfig = uiSchema.parse(uiJson);

/** Valores que o servidor sabe preencher nos `.md`. */
const ALLOWED_PLACEHOLDERS = new Set(["now", "nowIso", "timeZone"]);
const REQUIRED_SECTIONS = ["# Papel", "# Entrada", "# Saída", "# Regras"];

const frontmatterSchema = z.object({
  name: z.string().min(1),
  model: z.literal("process"),
  timeoutMs: z.coerce.number().int().positive(),
  attemptMs: z.coerce.number().int().positive(),
  placeholders: z.string().transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean)),
});

export interface AgentDefinition {
  name: string;
  timeoutMs: number;
  attemptMs: number;
  /** O corpo do `.md`, com `{{placeholders}}`. */
  template: string;
}

/** Valida um `.md` de agente: frontmatter, secoes obrigatorias e placeholders declarados e conhecidos. */
export function parseAgentMarkdown(source: string, file: string): AgentDefinition {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: frontmatter ausente`);
  const raw: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) raw[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  const parsed = frontmatterSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${file}: frontmatter invalido (${z.prettifyError(parsed.error)})`);
  const { name, timeoutMs, attemptMs, placeholders } = parsed.data;
  if (file !== `${name}.md`) throw new Error(`${file}: name "${name}" deve ser o nome do arquivo`);
  if (attemptMs > timeoutMs) throw new Error(`${file}: attemptMs maior que timeoutMs`);

  const template = match[2].trim();
  for (const section of REQUIRED_SECTIONS) {
    if (!new RegExp(`^${section}$`, "m").test(template)) throw new Error(`${file}: secao ausente: ${section}`);
  }
  for (const placeholder of placeholders) {
    if (!ALLOWED_PLACEHOLDERS.has(placeholder)) throw new Error(`${file}: placeholder desconhecido: ${placeholder}`);
  }
  for (const [, used] of template.matchAll(/\{\{(\w+)\}\}/g)) {
    if (!placeholders.includes(used)) throw new Error(`${file}: {{${used}}} usado e nao declarado`);
  }
  return { name, timeoutMs, attemptMs, template };
}

const AGENTS_DIR = join(__dirname, "agents");
const cache = new Map<string, AgentDefinition>();

export function loadAgentDefinition(name: string): AgentDefinition {
  let definition = cache.get(name);
  if (!definition) {
    const file = `${name}.md`;
    definition = parseAgentMarkdown(readFileSync(join(AGENTS_DIR, file), "utf8"), file);
    cache.set(name, definition);
  }
  return definition;
}

export function renderAgentPrompt(definition: AgentDefinition, values: Record<string, string>): string {
  return definition.template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`${definition.name}: placeholder sem valor: {{${key}}}`);
    return value;
  });
}

/** Rotulo predefinido de um passo na caixa de processo. */
export function stepLabel(agent: string): string {
  return uiConfig.steps[agent] ?? agent;
}
