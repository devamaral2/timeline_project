import { vi } from "vitest";
import { AgentFileNotFoundError } from "../../agent/config/agent-files.service";
import { uiConfig } from "../process-config";
import { createEventsKit } from "../../events/testing/in-memory-events-kit";
import { InMemoryTaskRepository } from "../../tasks/testing/in-memory-task.repository";
import { InMemoryEntityBatchWriter } from "../../agent/testing/in-memory-entity-batch-writer";
import { InMemoryRecurrenceRepository } from "../../recurrences/testing/in-memory-recurrence.repository";
import { StubScopedSqlQuery } from "../../agent/testing/stub-scoped-sql-query";
import type { ScopedSqlOutcome } from "../../../domain/ports";
import type { StructuredCompletionGateway, StructuredCompletionInput } from "../../agent/gateways/structured-completion.gateway";
import type { JevProcessClient, JevResult } from "../jev-process.client";
import { ProcessAgentRunner } from "../process-agent-runner";
import { ProcessEditWorker } from "../process-edit-worker";
import { ProcessEditTargetWorker } from "../process-edit-target-worker";
import { ProcessTargetEditWorker } from "../process-target-edit-worker";
import type { MealParsingGateway } from "../../events/gateways/meal-parsing.gateway";
import { ProcessFinalizer } from "../process-finalizer";
import { ProcessQueryWorker } from "../process-query-worker";
import { ProcessStepWorker } from "../process-step-worker";
import type { StepAgent } from "../process-steps";
import type { NewStep } from "../process-store";
import { InMemoryProcessStore } from "./in-memory-process-store";

export const NOW = new Date("2026-10-25T15:00:00Z");

/** Um modelo falso: devolve, por agente, a saida combinada (ou lanca o erro combinado). */
export class ScriptedStructuredGateway implements StructuredCompletionGateway {
  readonly calls: StructuredCompletionInput[] = [];
  readonly outputs = new Map<string, unknown>();
  failure?: Error;

  async complete(input: StructuredCompletionInput) {
    this.calls.push(input);
    if (this.failure) throw this.failure;
    const output = this.outputs.get(input.schemaName);
    if (output === undefined) throw new Error(`sem saida combinada para ${input.schemaName}`);
    return { value: output, modelName: "stub" };
  }
}

/** Um JEV falso: responde com as escolhas combinadas e guarda o que recebeu. */
export function scriptedJev(answer: (questions: Record<string, unknown>, state: Record<string, unknown>) => JevResult | Error) {
  const ask = vi.fn(async (_call: unknown, state: Record<string, unknown>, questions: Record<string, unknown>) => {
    const result = answer(questions, state);
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { ask } as unknown as JevProcessClient, ask };
}

export function confident(choice: string, confidence = 0.99): { choice: string; confidence: number; probability: number } {
  return { choice, confidence, probability: confidence };
}

export function result(answers: JevResult["answers"]): JevResult {
  return { model: "jev-test", latencyMs: 5, answers };
}

/** A estimativa da refeicao que o teste combina; a padrao e uma refeicao sem itens. */
export class ScriptedMealParsing implements MealParsingGateway {
  readonly texts: string[] = [];
  response: Awaited<ReturnType<MealParsingGateway["parseMeal"]>> = { items: [], modelProvider: "stub", modelName: "stub" };

  async parseMeal(input: { text: string }) {
    this.texts.push(input.text);
    return this.response;
  }
}

/** Os arquivos de skills e agentes em memoria: `write` guarda o texto e lembra o que foi escrito. */
export class FakeAgentFiles {
  readonly written: Array<{ path: string; text: string }> = [];
  constructor(readonly texts: Map<string, string> = new Map()) {}
  read(path: string) {
    const text = this.texts.get(path);
    if (text === undefined) throw new AgentFileNotFoundError(path);
    return { path, text };
  }
  async write(path: string, text: string) {
    this.texts.set(path, text);
    this.written.push({ path, text });
    return [];
  }
}

export function setupProcess(prompt = "pedido", sqlOutcome?: ScopedSqlOutcome) {
  const mealParsing = new ScriptedMealParsing();
  const kit = createEventsKit({
    mealParsingGateway: mealParsing,
    clock: () => NOW,
  });
  const tasks = new InMemoryTaskRepository();
  const recurrences = new InMemoryRecurrenceRepository(kit.database);
  const repositories = { events: kit.eventRepository, tasks, notes: kit.noteRepository, recurrences };
  const batchWriter = new InMemoryEntityBatchWriter(repositories);
  const store = new InMemoryProcessStore(() => NOW);
  const gateway = new ScriptedStructuredGateway();
  const runner = new ProcessAgentRunner(gateway);
  const process = store.seed({ id: "p1", prompt });
  const sql = new StubScopedSqlQuery(sqlOutcome);
  const deps = { store, runner, batchWriter, repositories, createEvent: kit.createEvent };
  const worker = new ProcessStepWorker(deps);
  const editWorker = new ProcessEditWorker({ ...deps, sql });
  const queryWorker = new ProcessQueryWorker({ store, runner, sql });
  const files = new FakeAgentFiles();
  const targetEditWorker = new ProcessTargetEditWorker({ ...deps, mealParsing, noteBuilder: kit.noteBuilder, files });
  const editTargetWorker = new ProcessEditTargetWorker({
    store, repositories, files, failureText: (code) => uiConfig.targetFailed[code],
  });
  const finalizer = (jev: JevProcessClient) => new ProcessFinalizer({ ...deps, jev });
  return { ...kit, mealParsing, files, targetEditWorker, editTargetWorker, recurrences, repositories, batchWriter, store, gateway, runner, process, worker, editWorker, queryWorker, sql, finalizer, tasks };
}

export async function addStep(
  ctx: ReturnType<typeof setupProcess>,
  id: string,
  agent: StepAgent,
  expected: "one" | "many" = "one",
  input?: NewStep["input"],
) {
  await ctx.store.beginSteps("p1", [{ id, agent, expected, input }], {});
  return { processId: "p1", stepId: id };
}

const ZERO_TOTALS = { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 };

/** O `data` de uma nota de refeicao: pronta (com receita) ou ainda em geracao. */
export function mealData(description: string, status: "completed" | "pending" = "completed") {
  return {
    name: "Almoço", description, foodItems: [], totals: ZERO_TOTALS, generation: { status },
    ...(status === "completed" ? { recipe: { source: "model", ingredients: [{ name: "arroz", quantity: "100 g" }], steps: ["Cozinhe."] }, nutritionSource: "model-estimate" } : {}),
  };
}
