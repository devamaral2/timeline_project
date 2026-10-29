import { vi } from "vitest";
import { createEventsKit } from "../../events/testing/in-memory-events-kit";
import { StubMealParsingGateway } from "../../events/testing/stub-meal-parsing.gateway";
import { InMemoryTaskRepository } from "../../tasks/testing/in-memory-task.repository";
import { InMemoryEntityBatchWriter } from "../../agent/testing/in-memory-entity-batch-writer";
import { InMemoryRecurrenceRepository } from "../../recurrences/testing/in-memory-recurrence.repository";
import { StubScopedSqlQuery } from "../../agent/testing/stub-scoped-sql-query";
import type { ScopedSqlOutcome } from "../../../domain/ports";
import type { StructuredCompletionGateway, StructuredCompletionInput } from "../../agent/gateways/structured-completion.gateway";
import type { JevProcessClient, JevResult } from "../jev-process.client";
import { ProcessAgentRunner } from "../process-agent-runner";
import { ProcessEditWorker } from "../process-edit-worker";
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

export function setupProcess(prompt = "pedido", sqlOutcome?: ScopedSqlOutcome) {
  const kit = createEventsKit({
    mealParsingGateway: new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
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
  const finalizer = (jev: JevProcessClient) => new ProcessFinalizer({ ...deps, jev });
  return { ...kit, recurrences, repositories, batchWriter, store, gateway, runner, process, worker, editWorker, queryWorker, sql, finalizer, tasks };
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
