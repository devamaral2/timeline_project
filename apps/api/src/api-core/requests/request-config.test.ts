import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  dispatchConfig, loadAgentDefinition, parseAgentMarkdown, renderAgentPrompt, stepLabel, uiConfig,
} from "./request-config";
import { DISPATCH_ROUTES, LEGACY_STEP_AGENTS, STEP_AGENTS } from "./request-steps";

const valid = `---
name: demo
model: steps
timeoutMs: 8000
attemptMs: 4000
placeholders: now
---
# Papel
Agora: {{now}}
# Entrada
x
# Saída
y
# Regras
z
`;

describe("agentes em .md", () => {
  test("todo .md da pasta carrega e e referenciado por um agente conhecido", () => {
    const files = readdirSync(join(__dirname, "agents")).filter((file) => file.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const name = file.replace(/\.md$/, "");
      expect(loadAgentDefinition(name).name).toBe(name);
    }
    for (const agent of [...STEP_AGENTS, "failure-explainer"]) expect(files).toContain(`${agent}.md`);
    // O fallback e o Hermes: nao ha mais agente proprio para ele.
    expect(files).not.toContain("fallback.md");
  });

  test("o agente unico de escrita nunca pergunta, e os agentes de criacao e de series que ele substituiu sairam", () => {
    const text = loadAgentDefinition("entity").template;
    expect(text).toMatch(/NUNCA faça perguntas/);
    for (const list of ["tasks", "artifacts", "series", "taskEdits", "artifactEdits", "seriesEdits", "query"]) {
      expect(text).toContain(`"${list}"`);
    }
    const files = readdirSync(join(__dirname, "agents"));
    for (const agent of ["task-create", "artifact-create", "recurring-task-create", "recurring-task-edit"]) {
      expect(files).not.toContain(`${agent}.md`);
    }
  });

  test("renderiza so com os placeholders declarados", () => {
    const definition = parseAgentMarkdown(valid, "demo.md");
    expect(renderAgentPrompt(definition, { now: "agora" })).toContain("Agora: agora");
    expect(() => renderAgentPrompt(definition, {})).toThrow(/sem valor/);
  });

  test.each([
    ["sem frontmatter", "# Papel\n", /frontmatter ausente/],
    ["placeholder desconhecido", valid.replace("placeholders: now", "placeholders: now, nome"), /desconhecido/],
    ["placeholder usado e nao declarado", valid.replace("Agora: {{now}}", "Agora: {{nowIso}}"), /nao declarado/],
    ["secao ausente", valid.replace("# Regras", "# Outra"), /secao ausente: # Regras/],
    ["nome diferente do arquivo", valid.replace("name: demo", "name: outro"), /deve ser o nome do arquivo/],
    ["tentativa maior que o orcamento", valid.replace("attemptMs: 4000", "attemptMs: 9000"), /attemptMs maior/],
  ])("rejeita %s", (_, source, message) => {
    expect(() => parseAgentMarkdown(source, "demo.md")).toThrow(message);
  });
});

describe("parametros do JEV e textos predefinidos em .json", () => {
  test("o despacho tem so as tres perguntas de sim ou nao, uma por destino", () => {
    expect(Object.keys(dispatchConfig.questions)).toEqual(["query", "write", "config"]);
    expect(Object.keys(dispatchConfig.questions).sort()).toEqual([...DISPATCH_ROUTES].sort());
    for (const [name, question] of Object.entries(dispatchConfig.questions)) {
      expect(Object.keys(question.criteria), name).toEqual(["yes", "no"]);
    }
    expect(dispatchConfig.minCertainty).toBe(0.7);
  });

  test("todo agente tem rotulo predefinido, e os que sairam tambem, para os pedidos antigos", () => {
    for (const agent of [...STEP_AGENTS, ...LEGACY_STEP_AGENTS]) expect(uiConfig.steps[agent]).toBeTruthy();
    expect(stepLabel("entity")).toBe("Criando e atualizando registros");
    expect(Object.keys(uiConfig.steps).sort()).toEqual([...STEP_AGENTS, ...LEGACY_STEP_AGENTS].sort());
  });
});
