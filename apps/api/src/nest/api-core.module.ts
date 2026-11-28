import { DynamicModule, Module } from "@nestjs/common";
import {
  ARTIFACT_REPOSITORY,
  ENTITY_BATCH_WRITER,
  TASK_REPOSITORY,
  RECURRENCE_REPOSITORY,
  WORKOUT_CATALOG,
} from "../infrastructure/persistence/tokens";
import { PersistenceModule } from "./persistence.module";
import type {
  ArtifactRepository,
  EntityBatchWriter,
  TaskRepository,
  RecurrenceRepository,
  WorkoutCatalog,
} from "../domain/ports";
import { JobsModule } from "./jobs.module";
import { ArtifactBuilder } from "../api-core/artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../api-core/tasks/create-task.usecase";
import { requestClock } from "../api-core/tasks/request-clock";
import { MaterializeRecurrencesUseCase } from "../api-core/recurrences/materialize-recurrences.usecase";
import { REQUEST_EXPORTS, REQUEST_PROVIDERS } from "./request-providers";

/** A espera na fila e as novas tentativas nao podem mudar o que "hoje" ou "agora" queriam dizer no envio. */
@Module({ imports: [PersistenceModule] })
export class ApiCoreModule {
  // Os modulos de funcionalidade compartilham um runtime e um registro de handlers, nao um worker por import.
  private static root?: DynamicModule;

  static forRoot(): DynamicModule {
    if (ApiCoreModule.root) return ApiCoreModule.root;
    ApiCoreModule.root = {
      module: ApiCoreModule,
      imports: [PersistenceModule, JobsModule],
      providers: [
        {
          provide: MaterializeRecurrencesUseCase,
          inject: [RECURRENCE_REPOSITORY, ARTIFACT_REPOSITORY],
          useFactory: (recurrences: RecurrenceRepository, artifacts: ArtifactRepository) =>
            new MaterializeRecurrencesUseCase(recurrences, artifacts),
        },
        {
          provide: ArtifactBuilder,
          inject: [WORKOUT_CATALOG],
          useFactory: (workoutCatalog: WorkoutCatalog) => new ArtifactBuilder(workoutCatalog),
        },
        {
          provide: CreateTaskUseCase,
          inject: [TASK_REPOSITORY, ARTIFACT_REPOSITORY, ArtifactBuilder, ENTITY_BATCH_WRITER],
          useFactory: (tasks: TaskRepository, artifacts: ArtifactRepository, builder: ArtifactBuilder, writer: EntityBatchWriter) =>
            new CreateTaskUseCase(tasks, artifacts, builder, writer, requestClock),
        },
        ...REQUEST_PROVIDERS,
      ],
      exports: [
        PersistenceModule,
        JobsModule,
        MaterializeRecurrencesUseCase,
        ArtifactBuilder,
        CreateTaskUseCase,
        ...REQUEST_EXPORTS,
      ],
    };
    return ApiCoreModule.root;
  }
}
