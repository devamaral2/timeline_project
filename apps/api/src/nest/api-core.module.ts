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
import { ArtifactBuilder } from "../api-core/artifacts/services/artifact-builder.service";
import { CreateTaskUseCase } from "../api-core/tasks/create-task.usecase";
import { requestClock } from "../api-core/tasks/request-clock";
import { MaterializeRecurrencesUseCase } from "../api-core/recurrences/materialize-recurrences.usecase";

/**
 * O que as rotas que ainda vivem no Nest precisam do nucleo. O worker dos
 * pedidos, o registro de handlers e o servico de arquivos vem do composition
 * root pelo `ApiRuntimeModule`; aqui so ficam os colaboradores sem lifecycle da
 * Leitura diaria e dos artefatos.
 */
@Module({ imports: [PersistenceModule] })
export class ApiCoreModule {
  private static root?: DynamicModule;

  static forRoot(): DynamicModule {
    if (ApiCoreModule.root) return ApiCoreModule.root;
    ApiCoreModule.root = {
      module: ApiCoreModule,
      imports: [PersistenceModule],
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
      ],
      exports: [PersistenceModule, MaterializeRecurrencesUseCase, ArtifactBuilder, CreateTaskUseCase],
    };
    return ApiCoreModule.root;
  }
}
