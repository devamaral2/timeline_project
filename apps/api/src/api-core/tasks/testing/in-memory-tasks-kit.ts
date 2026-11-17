import type { Artifact, Task } from "../../../domain/index";
import type { RecurrenceRepository, WorkoutCatalog } from "../../../domain/ports";
import { InMemoryArtifactRepository } from "../../artifacts/testing/in-memory-artifact.repository";
import { ArtifactBuilder } from "../../artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../create-task.usecase";
import { InMemoryEntityBatchWriter } from "./in-memory-entity-batch-writer";
import { InMemoryTaskDatabase } from "./in-memory-task-database";
import { InMemoryTaskRepository } from "./in-memory-task.repository";
import { InMemoryWorkoutCatalog } from "./in-memory-workout.catalog";

export interface TasksKitOptions {
  tasks?: Task[];
  artifacts?: Artifact[];
  workoutCatalog?: WorkoutCatalog;
  recurrences?: RecurrenceRepository;
  clock?: () => Date;
}

/**
 * Tudo que um teste de tarefa precisa montado junto: o banco em memoria
 * compartilhado entre os repositorios, o construtor de artefatos, o escritor em
 * lote e a criacao de tarefa.
 */
export function createTasksKit(options: TasksKitOptions = {}) {
  const database = new InMemoryTaskDatabase(options.tasks, options.artifacts);
  const taskRepository = new InMemoryTaskRepository(database);
  const artifactRepository = new InMemoryArtifactRepository(database.artifacts);
  const artifactBuilder = new ArtifactBuilder(options.workoutCatalog ?? new InMemoryWorkoutCatalog());
  const batchWriter = new InMemoryEntityBatchWriter(
    { tasks: taskRepository, subtasks: database, artifacts: artifactRepository, recurrences: options.recurrences },
    database.derivations,
  );
  const createTask = new CreateTaskUseCase(taskRepository, artifactRepository, artifactBuilder, batchWriter, options.clock);
  return { database, taskRepository, artifactRepository, artifactBuilder, batchWriter, createTask };
}
