import type { EntityBatchWriter, RecurrenceRepository, ScopedSqlQuery, TaskRepository } from "../domain/ports";
import type { ArtifactRepository } from "../domain/ports";
import { AgentFileArtifactsReconciler } from "../api-core/agent/config/agent-file-artifacts.reconciler";
import { AgentFilesService } from "../api-core/agent/config/agent-files.service";
import {
  OpenRouterStructuredCompletionGateway,
  SelectedModelCompletionGateway,
  type StructuredCompletionGateway,
} from "../api-core/agent/gateways/structured-completion.gateway";
import { GenerateFoodUseCase } from "../api-core/artifacts/generate-food.usecase";
import { ArtifactBuilder } from "../api-core/artifacts/services/artifact-builder.service";
import { MaterializeRecurrencesUseCase } from "../api-core/recurrences/materialize-recurrences.usecase";
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
import type { RequestStore } from "../api-core/requests/request-store";
import { RequestTargetEditWorker } from "../api-core/requests/request-target-edit-worker";
import { VoiceTaskWorker } from "../api-core/requests/voice-task-worker";
import { DailyReadingGate } from "../api-core/tasks/daily-reading.gate";
import { CreateTaskUseCase } from "../api-core/tasks/create-task.usecase";
import { OpenRouterFoodParsingGateway } from "../api-core/tasks/gateways/openrouter-food-parsing.gateway";
import { OpenRouterTaskCommandParsingGateway } from "../api-core/tasks/gateways/openrouter-task-command-parsing.gateway";
import { PlaceResolver } from "../api-core/tasks/services/place-resolver.service";
import { TRANSCRIPTION_FORMAT_JOB, type TranscriptionRequests } from "../api-core/transcription/transcription-requests";
import type { ServerEnv } from "../config/env";
import { AgentFilesBootstrap } from "../infrastructure/agent-files/agent-files.bootstrap";
import { HermesClient } from "../infrastructure/hermes/hermes.client";
import type { JobsService } from "../infrastructure/jobs/jobs.service";
import { ModelAgent, type ModelProviderClient } from "../infrastructure/model-agent/model-agent";
import { AnthropicProvider } from "../infrastructure/model-agent/anthropic-provider";
import { AnthropicStructuredCompletionGateway } from "../infrastructure/model-agent/anthropic-structured.gateway";
import { OpenAIProvider } from "../infrastructure/model-agent/openai-provider";
import { OpenAIStructuredCompletionGateway } from "../infrastructure/model-agent/openai-structured.gateway";
import { OpenRouterProvider } from "../infrastructure/model-agent/openrouter-provider";
import { McpAgendaTools } from "../infrastructure/model-agent/agenda-tools";
import type { SqliteDatabase } from "@repo/sqlite";
import { SqliteCandidateQuery } from "../infrastructure/persistence/requests/sqlite-candidate.query";
import { PhotonPlaceSearchGateway } from "../infrastructure/places/photon-place-search.gateway";
import { LlmUnavailableError } from "../api-core/agent/errors/agent.errors";
import { FormatTranscriptionUseCase } from "../features/format-transcription/format-transcription.usecase";

/** O modelo da configuracao editavel pertence ao dono configurado no ambiente (ADR 0004). */
const configOwner = (env: ServerEnv) => env.AGENT_CONFIG_OWNER_USER_ID;

/**
 * As skills e agentes como arquivos (ADR 0005): um unico servico com watcher e um
 * unico bootstrap que o inicia e encerra. O composition root e o dono do lifecycle.
 */
export function createAgentFiles(
  env: ServerEnv,
  artifacts: ArtifactRepository,
): { files: AgentFilesService; bootstrap: AgentFilesBootstrap } {
  const files = new AgentFilesService(env.AGENT_FILES_DIR ?? "");
  const artifactsReconciler = new AgentFileArtifactsReconciler(files, artifacts, () => configOwner(env));
  const routerReconciler = new RouterArtifactsReconciler(artifacts, () => configOwner(env));
  return { files, bootstrap: new AgentFilesBootstrap(files, artifactsReconciler, routerReconciler) };
}

/** A porta da Leitura diaria, montada uma vez para o pedido de transcricao e a formatacao. */
export function createDailyReading(deps: {
  cards: ConstructorParameters<typeof DailyReadingGate>[0];
  artifacts: ArtifactRepository;
  artifactBuilder: ArtifactBuilder;
  createTask: CreateTaskUseCase;
  batchWriter: EntityBatchWriter;
  recurrences: MaterializeRecurrencesUseCase;
}): DailyReadingGate {
  return new DailyReadingGate(
    deps.cards,
    deps.artifacts,
    deps.artifactBuilder,
    deps.createTask,
    deps.batchWriter,
    deps.recurrences,
  );
}

/**
 * Quem atende as chamadas estruturadas dos agentes dos passos: o modelo fixo do
 * servidor, pelo OpenRouter, ou o provedor e o modelo que o usuario escolheu,
 * entre os que tem chave neste ambiente.
 */
function stepGateway(env: ServerEnv): StructuredCompletionGateway {
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
 * O agente do modo modelo (ADR 0019), com um cliente por provedor que tem
 * chave. Com o token do MCP e o dono configurados, usa as ferramentas da agenda;
 * sem eles, so conversa.
 */
function modelAgent(env: ServerEnv): ModelAgent | undefined {
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

export interface RequestOperationsDeps {
  jobs: JobsService;
  store: RequestStore;
  database: SqliteDatabase;
  tasks: TaskRepository;
  artifacts: ArtifactRepository;
  recurrences: RecurrenceRepository;
  createTask: CreateTaskUseCase;
  batchWriter: EntityBatchWriter;
  sql: ScopedSqlQuery;
  artifactBuilder: ArtifactBuilder;
  files: AgentFilesService;
  food: GenerateFoodUseCase;
  env: ServerEnv;
}

/**
 * Monta o worker dos pedidos (ADR 0013) sobre a fila unica: um dispatcher, um
 * worker por tipo de passo e o registro dos handlers. Nao inicia o polling; quem
 * decide a hora e o composition root, depois de todos os handlers existirem.
 */
export function createRequestOperations(deps: RequestOperationsDeps): RequestOperations {
  const { store, env } = deps;
  const reasoning = env.OPENROUTER_PROCESS_REASONING === "off" ? undefined : env.OPENROUTER_PROCESS_REASONING;
  const runner = new RequestAgentRunner(stepGateway(env), { thoughts: store, ...(reasoning ? { reasoning } : {}) });
  const repositories = { tasks: deps.tasks, artifacts: deps.artifacts, recurrences: deps.recurrences };
  // O lugar que a IA tira do pedido passa pela mesma busca de mapas do formulario.
  const places = new PlaceResolver(new PhotonPlaceSearchGateway());
  const foodParsing = new OpenRouterFoodParsingGateway();
  const commandParsing = new OpenRouterTaskCommandParsingGateway();
  const workers = { store, runner, batchWriter: deps.batchWriter, repositories, createTask: deps.createTask, places };

  return new RequestOperations(deps.jobs, store, {
    dispatcher: new RequestDispatcher(store, new JevClient(), {
      candidates: new SqliteCandidateQuery(deps.database), model: configModelFor,
    }),
    entity: new RequestEntityWorker({ ...workers, sql: deps.sql }),
    edit: new RequestEditWorker(workers),
    query: new RequestQueryWorker({ store, runner, sql: deps.sql }),
    finalizer: new RequestFinalizer({ store, runner }),
    editTarget: new RequestEditTargetWorker({
      store, repositories, files: deps.files, failureText: (code) => uiConfig.targetFailed[code],
    }),
    targetEdit: new RequestTargetEditWorker({
      ...workers, foodParsing, artifactBuilder: deps.artifactBuilder, files: deps.files,
    }),
    // O Hermes desligado nao tem cliente: o fallback que chega a ele termina com o aviso.
    hermes: new HermesTurnWorker(
      store,
      env.AI_AUTOMATION === "on" ? new HermesClient({ url: env.HERMES_URL, apiKey: env.HERMES_API_KEY }) : undefined,
    ),
    // Sem nenhuma chave de provedor nao ha agente: a rota responde 404 e um pedido antigo termina com o aviso.
    model: new ModelTurnWorker(store, modelAgent(env)),
    voice: new VoiceTaskWorker({ store, parsing: commandParsing, createTask: deps.createTask, batchWriter: deps.batchWriter, places }),
    food: deps.food,
  });
}

/** Sem chave da Anthropic neste ambiente, a formatacao falha e o pedido termina `failed`, em vez de ficar parado. */
const NO_ANTHROPIC: StructuredCompletionGateway = {
  complete: () => Promise.reject(new LlmUnavailableError("O provedor anthropic não está ligado neste ambiente.")),
};

/**
 * Registra o job interno `video-transcription-format` (spec #39, #46) no worker
 * da fila unica (ADR 0013). O composition root registra antes de o polling
 * comecar, como todos os outros handlers.
 */
export function registerFormatTranscriptionJob(
  jobs: Pick<JobsService, "register">,
  gate: Pick<DailyReadingGate, "place">,
  requests: TranscriptionRequests,
  env: ServerEnv,
): void {
  const key = providerKeys(env).anthropic;
  const format = new FormatTranscriptionUseCase(
    gate,
    requests,
    key ? new AnthropicStructuredCompletionGateway(key) : NO_ANTHROPIC,
  );
  jobs.register(
    TRANSCRIPTION_FORMAT_JOB,
    async (raw, context) => {
      await format.run((raw as { requestId: string }).requestId, context.userId);
    },
    {
      // O job esgotou as tentativas: o pedido nao fica em `running` para sempre.
      onFailure: async (raw, context) => {
        await format.fail((raw as { requestId: string }).requestId, context.userId);
      },
    },
  );
}
