import type { Artifact, Event } from "../../../domain";
import type { RecurrenceRepository, WorkoutCatalog } from "../../../domain/ports";
import { InMemoryArtifactRepository } from "../../artifacts/testing/in-memory-artifact.repository";
import { ArtifactBuilder } from "../../artifacts/services/artifact-builder.service";
import { CreateEventUseCase } from "../create-event.usecase";
import { InMemoryEntityBatchWriter } from "./in-memory-entity-batch-writer";
import { InMemoryEventDatabase } from "./in-memory-event-database";
import { InMemoryEventRepository } from "./in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "./in-memory-workout.catalog";

export interface EventsKitOptions {
  events?: Event[];
  artifacts?: Artifact[];
  workoutCatalog?: WorkoutCatalog;
  recurrences?: RecurrenceRepository;
  clock?: () => Date;
}

/**
 * Tudo que um teste de evento precisa montado junto: o banco em memoria
 * compartilhado entre os repositorios, o construtor de artefatos, o escritor em
 * lote e a criacao de evento.
 */
export function createEventsKit(options: EventsKitOptions = {}) {
  const database = new InMemoryEventDatabase(options.events, options.artifacts);
  const eventRepository = new InMemoryEventRepository(database);
  const artifactRepository = new InMemoryArtifactRepository(database.artifacts);
  const artifactBuilder = new ArtifactBuilder(options.workoutCatalog ?? new InMemoryWorkoutCatalog());
  const batchWriter = new InMemoryEntityBatchWriter(
    { events: eventRepository, artifacts: artifactRepository, recurrences: options.recurrences },
    database.derivations,
  );
  const createEvent = new CreateEventUseCase(eventRepository, artifactRepository, artifactBuilder, batchWriter, options.clock);
  return { database, eventRepository, artifactRepository, artifactBuilder, batchWriter, createEvent };
}
