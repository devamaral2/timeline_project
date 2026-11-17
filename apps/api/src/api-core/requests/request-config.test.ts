import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  dispatchConfig, linkConfig, loadAgentDefinition, parseAgentMarkdown, renderAgentPrompt, stepLabel, uiConfig,
} from "./request-config";
import { DISPATCH_STEPS, STEP_AGENTS } from "./request-steps";

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

  test("os agentes de criacao nao consultam nem criam fora do seu papel", () => {
    for (const agent of ["task-create", "artifact-create", "recurring-task-create"]) {
      const text = loadAgentDefinition(agent).template;
      expect(text).toMatch(/NUNCA faça perguntas/);
      expect(text).not.toMatch(/query_data|SELECT /i);
    }
    expect(loadAgentDefinition("task-create").template).toMatch(/não cria artefatos/);
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
  test("cada pergunta de despacho tem criterios e todo passo roteavel tem a sua pergunta", () => {
    for (const [name, question] of Object.entries(dispatchConfig.questions)) {
      expect(Object.keys(question.criteria).length, name).toBeGreaterThanOrEqual(2);
    }
    for (const question of Object.keys(DISPATCH_STEPS)) expect(dispatchConfig.questions[question]).toBeDefined();
    expect(Object.keys(dispatchConfig.questions)).toEqual(expect.arrayContaining([
      "task_create", "task_edit", "artifact_create", "artifact_edit", "recurring_task_create", "recurring_task_edit", "query",
    ]));
    expect(Object.keys(dispatchConfig.questions).sort()).toEqual(Object.keys(DISPATCH_STEPS).sort());
    expect(dispatchConfig.minCertainty).toBe(0.92);
    expect(linkConfig.minCertainty).toBe(0.92);
  });

  test("todo agente tem rotulo predefinido (e o `fallback` antigo, para os pedidos que ainda o tem)", () => {
    for (const agent of [...STEP_AGENTS, "fallback"]) expect(uiConfig.steps[agent]).toBeTruthy();
    expect(stepLabel("task-create")).toBe("Criando tarefas");
    expect(Object.keys(uiConfig.steps).sort()).toEqual([...STEP_AGENTS, "fallback"].sort());
  });
});
