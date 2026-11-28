import {
  Inject,
  Injectable,
  type ModuleMetadata,
  type OnModuleDestroy,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import { getServerEnv } from "../config/env";
import type {
  ArtifactRepository,
  EntityBatchWriter,
  TaskRepository,
  FoodGenerationRepository,
  RecurrenceRepository,
  ScopedSqlQuery,
} from "../domain/ports";
import { AgentFilesBootstrap } from "../infrastructure/agent-files/agent-files.bootstrap";
import { McpAgendaTools } from "../infrastructure/model-agent/agenda-tools";
import { AnthropicProvider } from "../infrastructure/model-agent/anthropic-provider";
import { AnthropicStructuredCompletionGateway } from "../infrastructure/model-agent/anthropic-structured.gateway";
import { ModelAgent, type ModelProviderClient } from "../infrastructure/model-agent/model-agent";
import { OpenAIProvider } from "../infrastructure/model-agent/openai-provider";
import { OpenAIStructuredCompletionGateway } from "../infrastructure/model-agent/openai-structured.gateway";
import { OpenRouterProvider } from "../infrastructure/model-agent/openrouter-provider";
import { HermesClient } from "../infrastructure/hermes/hermes.client";
import { JobsService } from "../infrastructure/jobs/jobs.service";
import type { PostgresDatabase } from "../infrastructure/persistence/database/postgres-database";
import {
  ARTIFACT_REPOSITORY,
  DATABASE,
  ENTITY_BATCH_WRITER,
  TASK_REPOSITORY,
  RECURRENCE_REPOSITORY,
  SCOPED_SQL_QUERY,
} from "../infrastructure/persistence/tokens";
import { PostgresCandidateQuery } from "../infrastructure/persistence/requests/postgres-candidate.query";
import { PostgresRequestStore } from "../infrastructure/persistence/requests/postgres-request.store";
import { AgentFileArtifactsReconciler } from "../api-core/agent/config/agent-file-artifacts.reconciler";
import { AgentFilesService } from "../api-core/agent/config/agent-files.service";
import {
  OpenRouterStructuredCompletionGateway, SelectedModelCompletionGateway, type StructuredCompletionGateway,
} from "../api-core/agent/gateways/structured-completion.gateway";
import { GenerateFoodUseCase } from "../api-core/artifacts/generate-food.usecase";
import { ArtifactBuilder } from "../api-core/artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../api-core/tasks/create-task.usecase";
import { OpenRouterTaskCommandParsingGateway } from "../api-core/tasks/gateways/openrouter-task-command-parsing.gateway";
import { OpenRouterFoodParsingGateway } from "../api-core/tasks/gateways/openrouter-food-parsing.gateway";
import { PlaceResolver } from "../api-core/tasks/services/place-resolver.service";
import { PhotonPlaceSearchGateway } from "../infrastructure/places/photon-place-search.gateway";
import { providerKeys } from "../api-core/requests/model-catalog";
import { configModelFor, modelAgendaOwner } from "../api-core/requests/model-config";
import { modelSystemPrompt } from "../api-core/requests/model-prompt";
import { ModelTurnWorker } from "../api-core/requests/model-turn-worker";
import { HermesTurnWorker } from "../api-core/requests/hermes-turn-worker";
import { JevClient } from "../api-core/requests/jev.client";
import { RouterArtifactsReconciler } from "../api-core/requests/jev-router-artifacts";
import { RequestAgentRunner } from "../api-core/requests/request-agent-runner";
import { uiConfig } from "../api-core/requests/request-config";
import { RequestDispatcher } from "../api-core/requests/request-dispatcher";
import { RequestEditTargetWorker } from "../api-core/requests/request-edit-target-worker";
import { RequestEditWorker } from "../api-core/requests/request-edit-worker";
import { RequestEntityWorker } from "../api-core/requests/request-entity-worker";
import { RequestFinalizer } from "../api-core/requests/request-finalizer";
import { RequestOperations } from "../api-core/requests/request-operations";
import { RequestQueryWorker } from "../api-core/requests/request-query-worker";
import { RequestTargetEditWorker } from "../api-core/requests/request-target-edit-worker";
import { VoiceTaskWorker } from "../api-core/requests/voice-task-worker";

const configOwner = () => getServerEnv().AGENT_CONFIG_OWNER_USER_ID;

/** Adaptador do lifecycle antigo: o registro de handlers tem `start` explicito. */
@Injectable()
export class RequestOperationsLifecycle implements OnModuleInit {
  constructor(@Inject(RequestOperations) private readonly operations: RequestOperations) {}

  onModuleInit(): void {
    this.operations.startHandlers();
  }
}

/** Adaptador do lifecycle antigo: os watchers da pasta de agentes tem `start`/`stop` explicitos. */
@Injectable()
export class AgentFilesLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(AgentFilesBootstrap) private readonly bootstrap: AgentFilesBootstrap) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrap.start();
  }

  onModuleDestroy(): void {
    this.bootstrap.stop();
  }
}

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
  {
    provide: AgentFilesBootstrap,
    inject: [AgentFilesService, AgentFileArtifactsReconciler, RouterArtifactsReconciler],
    useFactory: (files: AgentFilesService, reconciler: AgentFileArtifactsReconciler, router: RouterArtifactsReconciler) =>
      new AgentFilesBootstrap(files, reconciler, router),
  },
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
      JobsService, PostgresRequestStore, ENTITY_BATCH_WRITER, TASK_REPOSITORY, ARTIFACT_REPOSITORY,
      RECURRENCE_REPOSITORY, CreateTaskUseCase, SCOPED_SQL_QUERY, DATABASE, OpenRouterFoodParsingGateway,
      OpenRouterTaskCommandParsingGateway, ArtifactBuilder, AgentFilesService, GenerateFoodUseCase,
    ],
    useFactory: (
      jobs: JobsService, store: PostgresRequestStore, batchWriter: EntityBatchWriter, tasks: TaskRepository,
      artifacts: ArtifactRepository, recurrences: RecurrenceRepository, createTask: CreateTaskUseCase,
      sql: ScopedSqlQuery, database: PostgresDatabase, foodParsing: OpenRouterFoodParsingGateway,
      commandParsing: OpenRouterTaskCommandParsingGateway, artifactBuilder: ArtifactBuilder, files: AgentFilesService,
      food: GenerateFoodUseCase,
    ) => {
      const env = getServerEnv();
      const reasoning = env.OPENROUTER_PROCESS_REASONING === "off" ? undefined : env.OPENROUTER_PROCESS_REASONING;
      const runner = new RequestAgentRunner(stepGateway(), { thoughts: store, ...(reasoning ? { reasoning } : {}) });
      const repositories = { tasks, artifacts, recurrences };
      // O lugar que a IA tira do pedido passa pela mesma busca de mapas do formulario.
      const places = new PlaceResolver(new PhotonPlaceSearchGateway());
      const deps = { store, runner, batchWriter, repositories, createTask, places };
      return new RequestOperations(jobs, store, {
        dispatcher: new RequestDispatcher(store, new JevClient(), {
          candidates: new PostgresCandidateQuery(database), model: configModelFor,
        }),
        entity: new RequestEntityWorker({ ...deps, sql }),
        edit: new RequestEditWorker(deps),
        query: new RequestQueryWorker({ store, runner, sql }),
        finalizer: new RequestFinalizer({ store, runner }),
        editTarget: new RequestEditTargetWorker({
          store, repositories, files, failureText: (code) => uiConfig.targetFailed[code],
        }),
        targetEdit: new RequestTargetEditWorker({ ...deps, foodParsing, artifactBuilder, files }),
        // O Hermes desligado nao tem cliente: o fallback que chega a ele termina com o aviso.
        hermes: new HermesTurnWorker(
          store, env.AI_AUTOMATION === "on" ? new HermesClient({ url: env.HERMES_URL, apiKey: env.HERMES_API_KEY }) : undefined,
        ),
        // Sem nenhuma chave de provedor nao ha agente: a rota responde 404 e um pedido antigo termina com o aviso.
        model: new ModelTurnWorker(store, modelAgent()),
        voice: new VoiceTaskWorker({ store, parsing: commandParsing, createTask, batchWriter, places }),
        food,
      });
    },
  },
  RequestOperationsLifecycle,
  AgentFilesLifecycle,
];

/**
 * Quem atende as chamadas estruturadas dos agentes dos passos: o modelo fixo do servidor, pelo OpenRouter, ou o
 * provedor e o modelo que o usuario escolheu para o pedido, entre os que tem chave neste ambiente.
 */
function stepGateway(): StructuredCompletionGateway {
  const env = getServerEnv();
  const keys = providerKeys(env);
  const fixed = new OpenRouterStructuredCompletionGateway(env.OPENROUTER_API_KEY, env.OPENROUTER_PROCESS_MODEL ?? env.OPENROUTER_MODEL);
  return new SelectedModelCompletionGateway(fixed, {
    ...(keys.anthropic ? { anthropic: new AnthropicStructuredCompletionGateway(keys.anthropic) } : {}),
    ...(keys.openai ? { openai: new OpenAIStructuredCompletionGateway(keys.openai) } : {}),
    // O mesmo gateway do modelo fixo: com a escolha do usuario, ele chama o modelo dela.
    ...(keys.openrouter ? { openrouter: fixed } : {}),
  });
}

/**
 * O agente do modo modelo (ADR 0019), com um cliente por provedor que tem chave. Com o token do MCP e o dono
 * configurados, ele usa as ferramentas da agenda; sem eles, so conversa.
 */
function modelAgent(): ModelAgent | undefined {
  const env = getServerEnv();
  const keys = providerKeys(env);
  const providers: Partial<Record<"anthropic" | "openai" | "openrouter", ModelProviderClient>> = {
    ...(keys.anthropic ? { anthropic: new AnthropicProvider(keys.anthropic) } : {}),
    ...(keys.openai ? { openai: new OpenAIProvider(keys.openai) } : {}),
    ...(keys.openrouter ? { openrouter: new OpenRouterProvider(keys.openrouter) } : {}),
  };
  if (Object.keys(providers).length === 0) return undefined;
  const agenda = modelAgendaOwner() !== undefined && env.MCP_URL && env.MCP_TOKEN
    ? new McpAgendaTools({ url: env.MCP_URL, token: env.MCP_TOKEN })
    : undefined;
  return new ModelAgent({
    providers,
    system: modelSystemPrompt({ agenda: agenda !== undefined }),
    ...(agenda ? { tools: agenda } : {}),
  });
}

/** O que os modulos de funcionalidade usam da IA. */
export const REQUEST_EXPORTS: NonNullable<ModuleMetadata["exports"]> = [RequestOperations, AgentFilesService];
