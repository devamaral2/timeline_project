import { PLACE_REVERSE_GATEWAY, PhotonPlaceReverseGateway, type PlaceReverseGateway } from "../infrastructure/places/photon-place-search.gateway";
import { DynamicModule, Module } from "@nestjs/common";
import {
  ARTIFACT_REPOSITORY,
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
  RECURRENCE_REPOSITORY,
  WORKOUT_CATALOG,
  PersistenceModule,
} from "../infrastructure/persistence";
import type {
  ArtifactRepository,
  EntityBatchWriter,
  EventRepository,
  RecurrenceRepository,
  WorkoutCatalog,
} from "../domain/ports";
import { JobsModule } from "../infrastructure/jobs/jobs.module";
import { getCurrentJob } from "../infrastructure/jobs/job-context";
import { ArtifactBuilder } from "./artifacts/services/artifact-builder.service";
import { CreateEventUseCase } from "./events/create-event.usecase";
import { MaterializeRecurrencesUseCase } from "./recurrences/materialize-recurrences.usecase";
import { REQUEST_EXPORTS, REQUEST_PROVIDERS } from "./requests/request-providers";

/** A espera na fila e as novas tentativas nao podem mudar o que "hoje" ou "agora" queriam dizer no envio. */
export function requestClock(): Date {
  const submittedAt = getCurrentJob()?.createdAt;
  return submittedAt ? new Date(submittedAt) : new Date();
}

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
          provide: CreateEventUseCase,
          inject: [EVENT_REPOSITORY, ARTIFACT_REPOSITORY, ArtifactBuilder, ENTITY_BATCH_WRITER, PLACE_REVERSE_GATEWAY],
          useFactory: (
            events: EventRepository, artifacts: ArtifactRepository, builder: ArtifactBuilder, writer: EntityBatchWriter,
            placeReverse: PlaceReverseGateway,
          ) => new CreateEventUseCase(events, artifacts, builder, writer, requestClock, placeReverse),
        },
        { provide: PLACE_REVERSE_GATEWAY, useFactory: () => new PhotonPlaceReverseGateway() },
        ...REQUEST_PROVIDERS,
      ],
      exports: [
        PersistenceModule,
        JobsModule,
        MaterializeRecurrencesUseCase,
        ArtifactBuilder,
        CreateEventUseCase,
        ...REQUEST_EXPORTS,
      ],
    };
    return ApiCoreModule.root;
  }
}
