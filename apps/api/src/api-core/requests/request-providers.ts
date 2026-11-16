import type { ModuleMetadata, Provider } from "@nestjs/common";
import { getServerEnv } from "../../config/env";
import type {
  ArtifactRepository,
  EntityBatchWriter,
  EventRepository,
  FoodGenerationRepository,
  RecurrenceRepository,
  ScopedSqlQuery,
} from "../../domain/ports";
import { AgentFilesBootstrap } from "../../infrastructure/agent-files/agent-files.bootstrap";
import { HermesClient } from "../../infrastructure/hermes/hermes.client";
import { JobsService } from "../../infrastructure/jobs/jobs.service";
import type { PostgresDatabase } from "../../infrastructure/persistence/database/postgres-database";
import {
  ARTIFACT_REPOSITORY,
  DATABASE,
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
  RECURRENCE_REPOSITORY,
  SCOPED_SQL_QUERY,
} from "../../infrastructure/persistence/persistence.module";
import { PostgresCandidateQuery } from "../../infrastructure/persistence/requests/postgres-candidate.query";
import { PostgresRequestStore } from "../../infrastructure/persistence/requests/postgres-request.store";
import { AgentFileArtifactsReconciler } from "../agent/config/agent-file-artifacts.reconciler";
import { AgentFilesService } from "../agent/config/agent-files.service";
import { OpenRouterStructuredCompletionGateway } from "../agent/gateways/structured-completion.gateway";
import { GenerateFoodUseCase } from "../artifacts/generate-food.usecase";
import { ArtifactBuilder } from "../artifacts/services/artifact-builder.service";
import { CreateEventUseCase } from "../events/create-event.usecase";
import { OpenRouterTaskCommandParsingGateway } from "../events/gateways/openrouter-task-command-parsing.gateway";
import { OpenRouterFoodParsingGateway } from "../events/gateways/openrouter-food-parsing.gateway";
import { PlaceResolver } from "../events/services/place-resolver.service";
import { PhotonPlaceSearchGateway } from "../../infrastructure/places/photon-place-search.gateway";
import { HermesTurnWorker } from "./hermes-turn-worker";
import { JevClient } from "./jev.client";
import { RouterArtifactsReconciler } from "./jev-router-artifacts";
import { RequestAgentRunner } from "./request-agent-runner";
import { uiConfig } from "./request-config";
import { RequestCreateWorker } from "./request-create-worker";
import { RequestDispatcher } from "./request-dispatcher";
import { RequestEditTargetWorker } from "./request-edit-target-worker";
import { RequestEditWorker } from "./request-edit-worker";
import { RequestFallback } from "./request-fallback";
import { RequestFinalizer } from "./request-finalizer";
import { RequestOperations } from "./request-operations";
import { RequestQueryWorker } from "./request-query-worker";
import { RequestTargetEditWorker } from "./request-target-edit-worker";
import { VoiceTaskWorker } from "./voice-task-worker";

const configOwner = () => getServerEnv().AGENT_CONFIG_OWNER_USER_ID;

/**
 * Tudo o que a IA precisa montado: a configuracao editavel do agente (ADR 0005), os gateways dos modelos, a
 * persistencia dos pedidos (ADR 0013) e as operacoes que registram os handlers da fila.
 */
export const REQUEST_PROVIDERS: Provider[] = [
  { provide: AgentFilesService, useFactory: () => new AgentFilesService(getServerEnv().AGENT_FILES_DIR ?? "") },
  {
    provide: AgentFileArtifactsReconciler,
    inject: [AgentFilesService, ARTIFACT_REPOSITORY],
    useFactory: (files: AgentFilesService, artifacts: ArtifactRepository) =>
      new AgentFileArtifactsReconciler(files, artifacts, configOwner),
  },
  {
    provide: RouterArtifactsReconciler,
    inject: [ARTIFACT_REPOSITORY],
    useFactory: (artifacts: ArtifactRepository) => new RouterArtifactsReconciler(artifacts, configOwner),
  },
  AgentFilesBootstrap,
  { provide: OpenRouterFoodParsingGateway, useFactory: () => new OpenRouterFoodParsingGateway() },
  { provide: OpenRouterTaskCommandParsingGateway, useFactory: () => new OpenRouterTaskCommandParsingGateway() },
  {
    provide: GenerateFoodUseCase,
    inject: [ARTIFACT_REPOSITORY, OpenRouterFoodParsingGateway],
    useFactory: (foods: FoodGenerationRepository, parsing: OpenRouterFoodParsingGateway) =>
      new GenerateFoodUseCase(foods, parsing),
  },
  {
    provide: PostgresRequestStore,
    inject: [DATABASE],
    useFactory: (database: PostgresDatabase) => new PostgresRequestStore(database),
  },
  {
    provide: RequestOperations,
    inject: [
      JobsService, PostgresRequestStore, ENTITY_BATCH_WRITER, EVENT_REPOSITORY, ARTIFACT_REPOSITORY,
      RECURRENCE_REPOSITORY, CreateEventUseCase, SCOPED_SQL_QUERY, DATABASE, OpenRouterFoodParsingGateway,
      OpenRouterTaskCommandParsingGateway, ArtifactBuilder, AgentFilesService, GenerateFoodUseCase,
    ],
    useFactory: (
      jobs: JobsService, store: PostgresRequestStore, batchWriter: EntityBatchWriter, events: EventRepository,
      artifacts: ArtifactRepository, recurrences: RecurrenceRepository, createEvent: CreateEventUseCase,
      sql: ScopedSqlQuery, database: PostgresDatabase, foodParsing: OpenRouterFoodParsingGateway,
      commandParsing: OpenRouterTaskCommandParsingGateway, artifactBuilder: ArtifactBuilder, files: AgentFilesService,
      food: GenerateFoodUseCase,
    ) => {
      const env = getServerEnv();
      const reasoning = env.OPENROUTER_PROCESS_REASONING === "off" ? undefined : env.OPENROUTER_PROCESS_REASONING;
      const runner = new RequestAgentRunner(
        new OpenRouterStructuredCompletionGateway(env.OPENROUTER_API_KEY, env.OPENROUTER_PROCESS_MODEL ?? env.OPENROUTER_MODEL),
        { thoughts: store, ...(reasoning ? { reasoning } : {}) },
      );
      const jev = new JevClient();
      const repositories = { events, artifacts, recurrences };
      // O lugar que a IA tira do pedido passa pela mesma busca de mapas do formulario.
      const places = new PlaceResolver(new PhotonPlaceSearchGateway());
      const deps = { store, runner, batchWriter, repositories, createEvent, places };
      return new RequestOperations(jobs, store, {
        dispatcher: new RequestDispatcher(store, jev, new PostgresCandidateQuery(database)),
        create: new RequestCreateWorker(deps),
        edit: new RequestEditWorker({ ...deps, sql }),
        query: new RequestQueryWorker({ store, runner, sql }),
        finalizer: new RequestFinalizer({ ...deps, jev }),
        fallback: new RequestFallback({ store, runner }),
        editTarget: new RequestEditTargetWorker({
          store, repositories, files, failureText: (code) => uiConfig.targetFailed[code],
        }),
        targetEdit: new RequestTargetEditWorker({ ...deps, foodParsing, artifactBuilder, files }),
        hermes: new HermesTurnWorker(store, new HermesClient({ url: env.HERMES_URL, apiKey: env.HERMES_API_KEY })),
        voice: new VoiceTaskWorker({ store, parsing: commandParsing, createEvent, batchWriter, places }),
        food,
      });
    },
  },
];

/** O que os modulos de funcionalidade usam da IA. */
export const REQUEST_EXPORTS: NonNullable<ModuleMetadata["exports"]> = [RequestOperations, AgentFilesService];
