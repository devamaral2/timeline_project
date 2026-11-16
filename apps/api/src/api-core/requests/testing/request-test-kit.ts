import type { GeoPointInput } from "@repo/contracts";
import { vi } from "vitest";
import type { ScopedSqlOutcome } from "../../../domain/ports";
import { AgentFileNotFoundError } from "../../agent/config/agent-files.service";
import type { StructuredCompletionGateway, StructuredCompletionInput } from "../../agent/gateways/structured-completion.gateway";
import { StubScopedSqlQuery } from "../../agent/testing/stub-scoped-sql-query";
import type { FoodParsingGateway } from "../../events/gateways/food-parsing.gateway";
import { InMemoryEventDatabase } from "../../events/testing/in-memory-event-database";
import { InMemoryEntityBatchWriter } from "../../events/testing/in-memory-entity-batch-writer";
import { InMemoryEventRepository } from "../../events/testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../../events/testing/in-memory-workout.catalog";
import { InMemoryArtifactRepository } from "../../artifacts/testing/in-memory-artifact.repository";
import { ArtifactBuilder } from "../../artifacts/services/artifact-builder.service";
import { CreateEventUseCase } from "../../events/create-event.usecase";
import { InMemoryRecurrenceRepository } from "../../recurrences/testing/in-memory-recurrence.repository";
import type { JevClient, JevResult } from "../jev.client";
import { RequestAgentRunner } from "../request-agent-runner";
import { uiConfig } from "../request-config";
import { RequestCreateWorker } from "../request-create-worker";
import { RequestEditTargetWorker } from "../request-edit-target-worker";
import { RequestEditWorker } from "../request-edit-worker";
import { RequestFinalizer } from "../request-finalizer";
import { RequestQueryWorker } from "../request-query-worker";
import type { RequestAgent } from "../request-steps";
import type { NewStep } from "../request-store";
import { RequestTargetEditWorker } from "../request-target-edit-worker";
import { InMemoryRequestStore } from "./in-memory-request-store";

export const NOW = new Date("2026-10-25T15:00:00Z");

/** Um modelo falso: devolve, por agente, a saida combinada (ou lanca o erro combinado). */
export class ScriptedStructuredGateway implements StructuredCompletionGateway {
  readonly calls: StructuredCompletionInput[] = [];
  readonly outputs = new Map<string, unknown>();
  /** O raciocinio que o modelo devolve junto da saida, por agente. */
  readonly reasonings = new Map<string, string>();
  failure?: Error;

  async complete(input: StructuredCompletionInput) {
    this.calls.push(input);
    if (this.failure) throw this.failure;
    const output = this.outputs.get(input.schemaName);
    if (output === undefined) throw new Error(`sem saida combinada para ${input.schemaName}`);
    const reasoning = this.reasonings.get(input.schemaName);
    return { value: output, modelName: "stub", ...(reasoning ? { reasoning } : {}) };
  }
}

/** Um JEV falso: responde com as escolhas combinadas e guarda o que recebeu. */
export function scriptedJev(answer: (questions: Record<string, unknown>, state: Record<string, unknown>) => JevResult | Error) {
  const ask = vi.fn(async (_call: unknown, state: Record<string, unknown>, questions: Record<string, unknown>) => {
    const result = answer(questions, state);
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { ask } as unknown as JevClient, ask };
}

export function confident(choice: string, confidence = 0.99): { choice: string; confidence: number; probability: number } {
  return { choice, confidence, probability: confidence };
}

export function result(answers: JevResult["answers"]): JevResult {
  return { model: "jev-test", latencyMs: 5, answers };
}

/** A estimativa do alimento que o teste combina; a padrao e um alimento sem itens. */
export class ScriptedFoodParsing implements FoodParsingGateway {
  readonly texts: string[] = [];
  response: Awaited<ReturnType<FoodParsingGateway["parseFood"]>> = { items: [], modelProvider: "stub", modelName: "stub" };

  async parseFood(input: { text: string }) {
    this.texts.push(input.text);
    return this.response;
  }
}

/** Um mapa falso: troca o lugar dito pelo endereco combinado (ou devolve o que foi dito) e guarda o que recebeu. */
export class ScriptedPlaces {
  readonly calls: Array<{ said: string; near?: GeoPointInput }> = [];
  readonly addresses = new Map<string, string>();

  async resolve(said: string, near?: GeoPointInput): Promise<string> {
    this.calls.push({ said, ...(near ? { near } : {}) });
    return this.addresses.get(said) ?? said;
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

/** Tudo de um pedido por passos montado em memoria, com o pedido `r1` ja em andamento. */
export function setupRequest(prompt = "pedido", sqlOutcome?: ScopedSqlOutcome) {
  // O mesmo banco em memoria para tarefas, artefatos e series: a serie gera ocorrencias de verdade nele.
  const database = new InMemoryEventDatabase();
  const eventRepository = new InMemoryEventRepository(database);
  const artifactRepository = new InMemoryArtifactRepository(database.artifacts);
  const recurrences = new InMemoryRecurrenceRepository(database);
  const artifactBuilder = new ArtifactBuilder(new InMemoryWorkoutCatalog());
  const repositories = { events: eventRepository, sequence: database, artifacts: artifactRepository, recurrences };
  const batchWriter = new InMemoryEntityBatchWriter(repositories, database.derivations);
  const createEvent = new CreateEventUseCase(eventRepository, artifactRepository, artifactBuilder, batchWriter, () => NOW);
  const kit = { database, eventRepository, artifactRepository, artifactBuilder, batchWriter, createEvent };
  const store = new InMemoryRequestStore(() => NOW, kit.database);
  const gateway = new ScriptedStructuredGateway();
  const runner = new RequestAgentRunner(gateway, { thoughts: store, clock: () => NOW });
  const request = store.seed({ id: "r1", prompt });
  const sql = new StubScopedSqlQuery(sqlOutcome);
  const foodParsing = new ScriptedFoodParsing();
  const files = new FakeAgentFiles();
  const places = new ScriptedPlaces();
  const deps = { store, runner, batchWriter: kit.batchWriter, repositories, createEvent: kit.createEvent, places };
  return {
    ...kit, recurrences, repositories, store, gateway, runner, request, sql, foodParsing, files, places,
    worker: new RequestCreateWorker(deps),
    editWorker: new RequestEditWorker({ ...deps, sql }),
    queryWorker: new RequestQueryWorker({ store, runner, sql }),
    targetEditWorker: new RequestTargetEditWorker({ ...deps, foodParsing, artifactBuilder: kit.artifactBuilder, files }),
    editTargetWorker: new RequestEditTargetWorker({
      store, repositories, files, failureText: (code) => uiConfig.targetFailed[code],
    }),
    finalizer: (jev: JevClient) => new RequestFinalizer({ ...deps, jev }),
  };
}

export async function addStep(
  ctx: ReturnType<typeof setupRequest>,
  id: string,
  agent: RequestAgent,
  expected: "one" | "many" = "one",
  input?: NewStep["input"],
) {
  await ctx.store.beginSteps("r1", [{ id, agent, expected, input }]);
  return { requestId: "r1", stepId: id };
}

const ZERO_TOTALS = { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 };

/** O `data` de um alimento: pronto (com receita) ou ainda a espera dos nutrientes. */
export function foodData(description: string, status: "completed" | "pending" = "completed") {
  return {
    description, items: [], totals: ZERO_TOTALS, generation: { status },
    ...(status === "completed" ? { recipe: { source: "model", ingredients: [{ name: "arroz", quantity: "100 g" }], steps: ["Cozinhe."] }, nutritionSource: "model-estimate" } : {}),
  };
}
