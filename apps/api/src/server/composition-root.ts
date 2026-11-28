import type { FastifyInstance } from "fastify";
import { ArtifactBuilder } from "../api-core/artifacts/services/artifact-builder.service";
import { MaterializeRecurrencesUseCase } from "../api-core/recurrences/materialize-recurrences.usecase";
import { requestClock } from "../api-core/tasks/request-clock";
import { CreateTaskUseCase } from "../api-core/tasks/create-task.usecase";
import type { LogSink } from "../common/logger";
import { getDatabaseEnv, getServerEnv } from "../config/env";
import type { ApiRoute } from "../http/api-route";
import { createProjectRoute } from "../features/create-project/create-project.route";
import { createTaskRoute } from "../features/create-task/create-task.route";
import { deleteTaskRoute } from "../features/delete-task/delete-task.route";
import { getTaskRoute } from "../features/get-task/get-task.route";
import { listAgendaTasksRoute } from "../features/list-agenda-tasks/list-agenda-tasks.route";
import { listProjectsRoute } from "../features/list-projects/list-projects.route";
import { listTrackedTasksRoute } from "../features/list-tracked-tasks/list-tracked-tasks.route";
import { setTaskSituationRoute } from "../features/set-task-situation/set-task-situation.route";
import { updateTaskRoute } from "../features/update-task/update-task.route";
import { CreateProjectUseCase } from "../features/create-project/create-project.usecase";
import { DeleteTaskUseCase } from "../features/delete-task/delete-task.usecase";
import { GetTaskUseCase } from "../features/get-task/get-task.usecase";
import { ListAgendaTasksUseCase } from "../features/list-agenda-tasks/list-agenda-tasks.usecase";
import { ListProjectsUseCase } from "../features/list-projects/list-projects.usecase";
import { ListTrackedTasksUseCase } from "../features/list-tracked-tasks/list-tracked-tasks.usecase";
import { SetTaskSituationUseCase } from "../features/set-task-situation/set-task-situation.usecase";
import { UpdateTaskUseCase } from "../features/update-task/update-task.usecase";
import { PostgresEntityBatchWriter } from "../infrastructure/persistence/agent-batch/postgres-entity-batch-writer";
import { PostgresWorkoutCatalog } from "../infrastructure/persistence/artifacts/postgres-workout.catalog";
import { PostgresArtifactRepository } from "../infrastructure/persistence/artifacts/repositories/postgres-artifact.repository";
import { PostgresDatabase } from "../infrastructure/persistence/database/postgres-database";
import { PostgresIdempotencyStore } from "../infrastructure/persistence/idempotency/postgres-idempotency.store";
import { PostgresProjectQuery } from "../infrastructure/persistence/projects/postgres-project.query";
import { PostgresProjectRepository } from "../infrastructure/persistence/projects/postgres-project.repository";
import { PostgresRecurrenceRepository } from "../infrastructure/persistence/recurrences/repositories/postgres-recurrence.repository";
import { PostgresTaskCardQuery } from "../infrastructure/persistence/tasks/queries/postgres-task-card.query";
import { PostgresTaskRequestLinkQuery } from "../infrastructure/persistence/tasks/queries/postgres-task-request-link.query";
import { PostgresTaskRepository } from "../infrastructure/persistence/tasks/repositories/postgres-task.repository";
import { createFastifyInstance, registerApiRoutes } from "./route-registrar";

export interface ApiRuntime {
  /** A instancia unica do Fastify para este processo. */
  fastify: FastifyInstance;
  /** As operacoes registradas, na mesma ordem da declaracao. */
  routes: readonly ApiRoute[];
  /** Deixa o servidor pronto antes do primeiro request. */
  start(): Promise<void>;
  /** Encerra o servidor e o pool que o composition root abriu. */
  close(): Promise<void>;
}

export interface CreateApiRuntimeOptions {
  /** Sem valor, usa `DATABASE_URL` do ambiente. */
  databaseUrl?: string;
  /** Sem valor, usa `AUTH_INTERNAL_SERVICE_KEY` do ambiente. */
  authInternalServiceKey?: string;
  /** Silencia a saida nos testes. */
  logger?: LogSink;
  bodyLimit?: number;
}

/**
 * O composition root da API: cria banco, repositorios, gateways, services e use
 * cases por constructor, na ordem explicita, e devolve o servidor com as rotas
 * ja registradas. Nao ha container, tokens, reflection nem auto-registro.
 */
export async function createApiRuntime(options: CreateApiRuntimeOptions = {}): Promise<ApiRuntime> {
  const databaseUrl = options.databaseUrl ?? getDatabaseEnv().DATABASE_URL;
  const authInternalServiceKey = options.authInternalServiceKey ?? getServerEnv().AUTH_INTERNAL_SERVICE_KEY;

  const database = PostgresDatabase.connect(databaseUrl);
  try {
    const taskRepository = new PostgresTaskRepository(database.db);
    const taskCardQuery = new PostgresTaskCardQuery(database.db);
    const taskRequestLinkQuery = new PostgresTaskRequestLinkQuery(database.db);
    const projectQuery = new PostgresProjectQuery(database.db);
    const projectRepository = new PostgresProjectRepository(database.db);
    const artifactRepository = new PostgresArtifactRepository(database.db);
    const recurrenceRepository = new PostgresRecurrenceRepository(database.db);
    const workoutCatalog = new PostgresWorkoutCatalog(database.db);
    const entityBatchWriter = new PostgresEntityBatchWriter(database.db);
    const idempotencyStore = new PostgresIdempotencyStore(database.db);

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
    const createProject = new CreateProjectUseCase(projectRepository);

    // Estaticas antes das parametrizadas: `/api/tasks/tracked` nao pode cair em `:taskId`.
    const routes: ApiRoute[] = [
      listTrackedTasksRoute(listTrackedTasks),
      listAgendaTasksRoute(listAgendaTasks),
      createTaskRoute(createTask),
      getTaskRoute(getTask),
      updateTaskRoute(updateTask),
      setTaskSituationRoute(setTaskSituation),
      deleteTaskRoute(deleteTask),
      listProjectsRoute(listProjects),
      createProjectRoute(createProject),
    ];

    const fastify = createFastifyInstance({ bodyLimit: options.bodyLimit });
    registerApiRoutes(fastify, routes, {
      authInternalServiceKey,
      idempotencyStore,
      logger: options.logger,
    });

    return {
      fastify,
      routes,
      start: async () => {
        await fastify.ready();
      },
      close: async () => {
        await fastify.close();
        await database.close();
      },
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}
