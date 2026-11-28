import type { FastifyInstance } from "fastify";
import { AgentFilesService } from "../api-core/agent/config/agent-files.service";
import { GenerateFoodUseCase } from "../api-core/artifacts/generate-food.usecase";
import { ArtifactBuilder } from "../api-core/artifacts/services/artifact-builder.service";
import { MaterializeRecurrencesUseCase } from "../api-core/recurrences/materialize-recurrences.usecase";
import { RequestOperations } from "../api-core/requests/request-operations";
import { CreateTaskUseCase } from "../api-core/tasks/create-task.usecase";
import { OpenRouterFoodParsingGateway } from "../api-core/tasks/gateways/openrouter-food-parsing.gateway";
import { requestClock } from "../api-core/tasks/request-clock";
import { TranscriptionWorkerUseCase } from "../api-core/transcription/transcription-worker.usecase";
import type { LogSink } from "../common/logger";
import { getDatabaseEnv, getJobsEnv, getServerEnv, isLoopbackHost, type ServerEnv } from "../config/env";
import { cancelRequestRoute } from "../features/cancel-request/cancel-request.route";
import { createArtifactRoute } from "../features/create-artifact/create-artifact.route";
import { CreateArtifactUseCase } from "../features/create-artifact/create-artifact.usecase";
import { createProjectRoute } from "../features/create-project/create-project.route";
import { CreateProjectUseCase } from "../features/create-project/create-project.usecase";
import { createRecurrenceRoute } from "../features/create-recurrence/create-recurrence.route";
import { CreateRecurrenceUseCase } from "../features/create-recurrence/create-recurrence.usecase";
import { createTaskRoute } from "../features/create-task/create-task.route";
import { deleteArtifactRoute } from "../features/delete-artifact/delete-artifact.route";
import { DeleteArtifactUseCase } from "../features/delete-artifact/delete-artifact.usecase";
import { deleteRecurrenceRoute } from "../features/delete-recurrence/delete-recurrence.route";
import { DeleteRecurrenceUseCase } from "../features/delete-recurrence/delete-recurrence.usecase";
import { deleteTaskRoute } from "../features/delete-task/delete-task.route";
import { DeleteTaskUseCase } from "../features/delete-task/delete-task.usecase";
import { deliverTranscriptionRoute } from "../features/deliver-transcription/deliver-transcription.route";
import { getArtifactRoute } from "../features/get-artifact/get-artifact.route";
import { GetArtifactUseCase } from "../features/get-artifact/get-artifact.usecase";
import { getModelOptionsRoute } from "../features/get-model-options/get-model-options.route";
import { getRecurrenceRoute } from "../features/get-recurrence/get-recurrence.route";
import { GetRecurrenceUseCase } from "../features/get-recurrence/get-recurrence.usecase";
import { getRequestRoute } from "../features/get-request/get-request.route";
import { getTaskRoute } from "../features/get-task/get-task.route";
import { GetTaskUseCase } from "../features/get-task/get-task.usecase";
import { listAgendaTasksRoute } from "../features/list-agenda-tasks/list-agenda-tasks.route";
import { ListAgendaTasksUseCase } from "../features/list-agenda-tasks/list-agenda-tasks.usecase";
import { listAgentFileBackupsRoute } from "../features/list-agent-file-backups/list-agent-file-backups.route";
import { listAgentFilesRoute } from "../features/list-agent-files/list-agent-files.route";
import { listArtifactsRoute } from "../features/list-artifacts/list-artifacts.route";
import { ListArtifactsUseCase } from "../features/list-artifacts/list-artifacts.usecase";
import { listProjectsRoute } from "../features/list-projects/list-projects.route";
import { ListProjectsUseCase } from "../features/list-projects/list-projects.usecase";
import { listRecurrencesRoute } from "../features/list-recurrences/list-recurrences.route";
import { ListRecurrencesUseCase } from "../features/list-recurrences/list-recurrences.usecase";
import { listRequestsRoute } from "../features/list-requests/list-requests.route";
import { listTrackedTasksRoute } from "../features/list-tracked-tasks/list-tracked-tasks.route";
import { ListTrackedTasksUseCase } from "../features/list-tracked-tasks/list-tracked-tasks.usecase";
import { CancelTranscriptionUseCase } from "../features/request-transcription/cancel-transcription.usecase";
import { requestTranscriptionRoute } from "../features/request-transcription/request-transcription.route";
import { RequestTranscriptionUseCase } from "../features/request-transcription/request-transcription.usecase";
import { readAgentFileRoute } from "../features/read-agent-file/read-agent-file.route";
import { requestAgentFileEditRoute } from "../features/request-agent-file-edit/request-agent-file-edit.route";
import { restoreAgentFileRoute } from "../features/restore-agent-file/restore-agent-file.route";
import { renewTranscriptionLeaseRoute } from "../features/renew-transcription-lease/renew-transcription-lease.route";
import { reserveTranscriptionRoute } from "../features/reserve-transcription/reserve-transcription.route";
import { saveDailyReadingRoute } from "../features/save-daily-reading/save-daily-reading.route";
import { SaveDailyReadingUseCase } from "../features/save-daily-reading/save-daily-reading.usecase";
import { searchPlacesRoute } from "../features/search-places/search-places.route";
import { SearchPlacesUseCase } from "../features/search-places/search-places.usecase";
import { setTaskSituationRoute } from "../features/set-task-situation/set-task-situation.route";
import { SetTaskSituationUseCase } from "../features/set-task-situation/set-task-situation.usecase";
import { suggestTagsRoute } from "../features/suggest-tags/suggest-tags.route";
import { SuggestTagsUseCase } from "../features/suggest-tags/suggest-tags.usecase";
import { startEditRequestRoute } from "../features/start-edit-request/start-edit-request.route";
import { startHermesRequestRoute } from "../features/start-hermes-request/start-hermes-request.route";
import { startModelRequestRoute } from "../features/start-model-request/start-model-request.route";
import { startRequestRoute } from "../features/start-request/start-request.route";
import { startVoiceRequestRoute } from "../features/start-voice-request/start-voice-request.route";
import { updateArtifactRoute } from "../features/update-artifact/update-artifact.route";
import { UpdateArtifactUseCase } from "../features/update-artifact/update-artifact.usecase";
import { updateRecurrenceRoute } from "../features/update-recurrence/update-recurrence.route";
import { UpdateRecurrenceUseCase } from "../features/update-recurrence/update-recurrence.usecase";
import { updateTaskRoute } from "../features/update-task/update-task.route";
import { UpdateTaskUseCase } from "../features/update-task/update-task.usecase";
import type { ApiRoute } from "../http/api-route";
import { AgentFilesBootstrap } from "../infrastructure/agent-files/agent-files.bootstrap";
import { JobsService } from "../infrastructure/jobs/jobs.service";
import { SqliteEntityBatchWriter } from "../infrastructure/persistence/agent-batch/sqlite-entity-batch-writer";
import { SqliteScopedSqlQuery } from "../infrastructure/persistence/agent-sql/sqlite-scoped-sql.query";
import { SqliteWorkoutCatalog } from "../infrastructure/persistence/artifacts/sqlite-workout.catalog";
import { SqliteArtifactTaskLinkQuery } from "../infrastructure/persistence/artifacts/queries/sqlite-artifact-task-link.query";
import { SqliteArtifactRepository } from "../infrastructure/persistence/artifacts/repositories/sqlite-artifact.repository";
import { openApiDatabase } from "../infrastructure/persistence/database/api-database";
import { SqliteIdempotencyStore } from "../infrastructure/persistence/idempotency/sqlite-idempotency.store";
import { SqliteJobStore } from "../infrastructure/persistence/jobs/sqlite-job.store";
import { SqliteProjectQuery } from "../infrastructure/persistence/projects/sqlite-project.query";
import { SqliteProjectRepository } from "../infrastructure/persistence/projects/sqlite-project.repository";
import { SqliteRecurrenceRepository } from "../infrastructure/persistence/recurrences/repositories/sqlite-recurrence.repository";
import { SqliteRequestStore } from "../infrastructure/persistence/requests/sqlite-request.store";
import { SqliteTaskCardQuery } from "../infrastructure/persistence/tasks/queries/sqlite-task-card.query";
import { SqliteTaskRequestLinkQuery } from "../infrastructure/persistence/tasks/queries/sqlite-task-request-link.query";
import { SqliteTaskRelations } from "../infrastructure/persistence/tasks/relations/sqlite-task-relations";
import { SqliteTagRepository } from "../infrastructure/persistence/tasks/repositories/sqlite-tag.repository";
import { SqliteTaskRepository } from "../infrastructure/persistence/tasks/repositories/sqlite-task.repository";
import { PhotonPlaceSearchGateway } from "../infrastructure/places/photon-place-search.gateway";
import { SqliteTranscriptionRequests } from "../infrastructure/persistence/transcription/sqlite-transcription-requests";
import {
  createAgentFiles,
  createDailyReading,
  createRequestOperations,
  registerFormatTranscriptionJob,
} from "./request-workers";
import { assertDeclaredOperations } from "./declared-operations";
import { createFastifyInstance, registerApiRoutes, registerDocumentation } from "./route-registrar";
import { createRuntimeLifecycle } from "./runtime-lifecycle";

export interface ApiRuntime {
  /** A instancia unica do Fastify para este processo. */
  fastify: FastifyInstance;
  /** As operacoes registradas, na mesma ordem da declaracao. */
  routes: readonly ApiRoute[];
  /** O worker unico da fila no SQLite da API (ADR 0013). */
  jobs: JobsService;
  /** O registro unico dos handlers dos pedidos. */
  requestOperations: RequestOperations;
  /** O servico unico das skills e agentes como arquivos (ADR 0005). */
  agentFiles: AgentFilesService;
  /** O bootstrap unico que inicia e encerra os watchers dos arquivos. */
  agentFilesBootstrap: AgentFilesBootstrap;
  /** Registra os handlers, inicia os recursos, deixa o servidor pronto e comeca o polling. */
  start(): Promise<void>;
  /** Para o trabalho, espera o que roda e fecha os recursos na ordem inversa. */
  close(): Promise<void>;
}

export interface CreateApiRuntimeOptions {
  /** O arquivo SQLite da API (ADR 0024). Sem valor, usa `API_DATABASE_PATH` do ambiente. */
  databasePath?: string;
  /** Sem valor, usa `AUTH_INTERNAL_SERVICE_KEY` do ambiente. */
  authInternalServiceKey?: string;
  /** Silencia a saida nos testes. */
  logger?: LogSink;
  bodyLimit?: number;
}

/**
 * O composition root da API: cria banco, repositorios, gateways, services, use
 * cases, o worker da fila unica e o servidor, por constructor, na ordem
 * explicita, e devolve o runtime com startup e shutdown proprios. Nao ha
 * container, tokens, reflection nem auto-registro.
 */
export async function createApiRuntime(options: CreateApiRuntimeOptions = {}): Promise<ApiRuntime> {
  const databasePath = options.databasePath ?? getDatabaseEnv().API_DATABASE_PATH;
  const serverEnv: ServerEnv = getServerEnv();
  const authInternalServiceKey = options.authInternalServiceKey ?? serverEnv.AUTH_INTERNAL_SERVICE_KEY;
  const jobsEnv = getJobsEnv();

  // Abre o arquivo e aplica as migrations pendentes, com uma copia antes de mudar o schema.
  const database = openApiDatabase(databasePath);
  try {
    const taskRepository = new SqliteTaskRepository(database);
    const tagRepository = new SqliteTagRepository(database);
    const placeSearch = new PhotonPlaceSearchGateway();
    const taskCardQuery = new SqliteTaskCardQuery(database);
    const taskRequestLinkQuery = new SqliteTaskRequestLinkQuery(database);
    const projectQuery = new SqliteProjectQuery(database);
    const projectRepository = new SqliteProjectRepository(database);
    const artifactRepository = new SqliteArtifactRepository(database);
    const artifactTaskLinkQuery = new SqliteArtifactTaskLinkQuery(database);
    const recurrenceRepository = new SqliteRecurrenceRepository(database);
    const workoutCatalog = new SqliteWorkoutCatalog(database);
    const entityBatchWriter = new SqliteEntityBatchWriter(database);
    const scopedSql = new SqliteScopedSqlQuery(database);
    const idempotencyStore = new SqliteIdempotencyStore(database);
    const requestStore = new SqliteRequestStore(database);
    const transcriptionRequests = new SqliteTranscriptionRequests(database);
    const taskRelations = new SqliteTaskRelations();

    const artifactBuilder = new ArtifactBuilder(workoutCatalog);
    const materializeRecurrences = new MaterializeRecurrencesUseCase(recurrenceRepository, artifactRepository);

    const createTask = new CreateTaskUseCase(taskRepository, artifactRepository, artifactBuilder, entityBatchWriter, requestClock);
    const updateTask = new UpdateTaskUseCase(taskRepository, artifactRepository, artifactBuilder, entityBatchWriter);
    const getTask = new GetTaskUseCase(taskRepository, artifactRepository, recurrenceRepository, taskRequestLinkQuery, projectQuery);
    const deleteTask = new DeleteTaskUseCase(taskRepository);
    const setTaskSituation = new SetTaskSituationUseCase(taskRepository, taskCardQuery);
    const listAgendaTasks = new ListAgendaTasksUseCase(taskCardQuery, materializeRecurrences);
    const listTrackedTasks = new ListTrackedTasksUseCase(taskCardQuery, materializeRecurrences);
    const listProjects = new ListProjectsUseCase(projectQuery);
    const suggestTags = new SuggestTagsUseCase(tagRepository);
    const searchPlaces = new SearchPlacesUseCase(placeSearch);
    const createProject = new CreateProjectUseCase(projectRepository);

    const listArtifacts = new ListArtifactsUseCase(artifactRepository, artifactTaskLinkQuery);
    const createArtifact = new CreateArtifactUseCase(artifactBuilder, taskRepository, entityBatchWriter);
    const getArtifact = new GetArtifactUseCase(artifactRepository, artifactTaskLinkQuery);
    const updateArtifact = new UpdateArtifactUseCase(
      artifactRepository,
      artifactTaskLinkQuery,
      artifactBuilder,
      taskRepository,
      entityBatchWriter,
    );
    const deleteArtifact = new DeleteArtifactUseCase(artifactRepository);

    const listRecurrences = new ListRecurrencesUseCase(recurrenceRepository);
    const createRecurrence = new CreateRecurrenceUseCase(recurrenceRepository, createTask, taskRepository);
    const getRecurrence = new GetRecurrenceUseCase(recurrenceRepository);
    const updateRecurrence = new UpdateRecurrenceUseCase(recurrenceRepository, createTask, taskRepository);
    const deleteRecurrence = new DeleteRecurrenceUseCase(recurrenceRepository);

    // O worker unico da fila no SQLite da API: uma instancia por processo, um registro por handler.
    const jobStore = new SqliteJobStore(database, jobsEnv.AI_JOBS_LEASE_MS, jobsEnv.AI_JOBS_MAX_ATTEMPTS);
    const jobs = new JobsService(jobStore, jobsEnv);

    // A pasta de skills e agentes tem um servico e um watcher, compartilhados pelas rotas e pelo worker.
    const { files: agentFiles, bootstrap: agentFilesBootstrap } = createAgentFiles(serverEnv, artifactRepository);

    const dailyReading = createDailyReading({
      cards: taskCardQuery,
      artifacts: artifactRepository,
      artifactBuilder,
      createTask,
      batchWriter: entityBatchWriter,
      recurrences: materializeRecurrences,
    });
    const cancelTranscription = new CancelTranscriptionUseCase(dailyReading, transcriptionRequests, jobs);
    // A Leitura diaria e o servico local compartilham a porta da leitura e as
    // relacoes de tarefa montadas uma vez aqui.
    const saveDailyReading = new SaveDailyReadingUseCase(dailyReading, taskRelations);
    const requestTranscription = new RequestTranscriptionUseCase(dailyReading, transcriptionRequests, taskRelations);
    const transcriptionWorker = new TranscriptionWorkerUseCase(dailyReading, entityBatchWriter, transcriptionRequests);

    const food = new GenerateFoodUseCase(artifactRepository, new OpenRouterFoodParsingGateway());
    const requestOperations = createRequestOperations({
      jobs,
      store: requestStore,
      database,
      tasks: taskRepository,
      artifacts: artifactRepository,
      recurrences: recurrenceRepository,
      createTask,
      batchWriter: entityBatchWriter,
      sql: scopedSql,
      artifactBuilder,
      files: agentFiles,
      food,
      env: serverEnv,
    });

    // Estaticas antes das parametrizadas: `/api/requests/model/options` nao pode cair em `:requestId`, e
    // `/api/requests/edit|hermes|model|voice` vem antes de `:requestId/cancel`.
    const routes: ApiRoute[] = [
      listTrackedTasksRoute(listTrackedTasks),
      listAgendaTasksRoute(listAgendaTasks),
      createTaskRoute(createTask),
      // Estaticas antes de `/api/tasks/:taskId`.
      saveDailyReadingRoute(saveDailyReading),
      requestTranscriptionRoute(requestTranscription),
      reserveTranscriptionRoute(transcriptionWorker),
      renewTranscriptionLeaseRoute(transcriptionWorker),
      deliverTranscriptionRoute(transcriptionWorker),
      getTaskRoute(getTask),
      updateTaskRoute(updateTask),
      setTaskSituationRoute(setTaskSituation),
      deleteTaskRoute(deleteTask),
      listProjectsRoute(listProjects),
      createProjectRoute(createProject),
      suggestTagsRoute(suggestTags),
      searchPlacesRoute(searchPlaces),
      listArtifactsRoute(listArtifacts),
      createArtifactRoute(createArtifact),
      getArtifactRoute(getArtifact),
      updateArtifactRoute(updateArtifact),
      deleteArtifactRoute(deleteArtifact),
      listRecurrencesRoute(listRecurrences),
      createRecurrenceRoute(createRecurrence),
      getRecurrenceRoute(getRecurrence),
      updateRecurrenceRoute(updateRecurrence),
      deleteRecurrenceRoute(deleteRecurrence),
      getModelOptionsRoute(),
      listRequestsRoute(requestOperations),
      startRequestRoute(requestOperations),
      startEditRequestRoute(requestOperations),
      startHermesRequestRoute(requestOperations),
      startModelRequestRoute(requestOperations),
      startVoiceRequestRoute(requestOperations),
      getRequestRoute(requestOperations),
      cancelRequestRoute(requestOperations, cancelTranscription),
      listAgentFilesRoute(agentFiles),
      readAgentFileRoute(agentFiles),
      listAgentFileBackupsRoute(agentFiles),
      restoreAgentFileRoute(agentFiles),
      requestAgentFileEditRoute(agentFiles, requestOperations),
    ];

    // Fora do loopback a API e alcancavel pela rede local: o CORS liga, como no Express.
    assertDeclaredOperations(routes);
    const fastify = createFastifyInstance({ bodyLimit: options.bodyLimit, cors: !isLoopbackHost(serverEnv.API_HOST) });
    registerApiRoutes(fastify, routes, {
      authInternalServiceKey,
      idempotencyStore,
      logger: options.logger,
    });
    await registerDocumentation(fastify, routes);

    const lifecycle = createRuntimeLifecycle({
      registerHandlers: () => {
        requestOperations.startHandlers();
        registerFormatTranscriptionJob(jobs, dailyReading, transcriptionRequests, serverEnv);
      },
      agentFiles: agentFilesBootstrap,
      fastify,
      jobs,
      database,
    });

    return {
      fastify,
      routes,
      jobs,
      requestOperations,
      agentFiles,
      agentFilesBootstrap,
      start: lifecycle.start,
      close: lifecycle.close,
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}
