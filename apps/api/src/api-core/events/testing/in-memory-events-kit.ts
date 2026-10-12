import type { Event, Note } from "../../../domain";
import { InMemoryNoteRepository } from "../../notes/testing/in-memory-note.repository";
import { NoteBuilder } from "../../notes/services/note-builder.service";
import { CreateEventUseCase } from "../create-event.usecase";
import type { MealParsingGateway } from "../gateways/meal-parsing.gateway";
import type { WorkoutCatalog } from "../../../domain/ports";
import { InMemoryEventDatabase } from "./in-memory-event-database";
import { InMemoryEventRepository } from "./in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "./in-memory-workout.catalog";
import { StubMealParsingGateway } from "./stub-meal-parsing.gateway";

export interface EventsKitOptions {
  events?: Event[];
  notes?: Note[];
  mealParsingGateway?: MealParsingGateway;
  workoutCatalog?: WorkoutCatalog;
  clock?: () => Date;
}

/**
 * Tudo que um teste de evento precisa montado junto: o banco em memoria
 * compartilhado entre os repositorios, o construtor de notes e a criacao.
 */
export function createEventsKit(options: EventsKitOptions = {}) {
  const database = new InMemoryEventDatabase(options.events, options.notes);
  const eventRepository = new InMemoryEventRepository(database);
  const noteRepository = new InMemoryNoteRepository(database.notes);
  const noteBuilder = new NoteBuilder(
    options.mealParsingGateway ?? new StubMealParsingGateway(),
    options.workoutCatalog ?? new InMemoryWorkoutCatalog(),
  );
  const createEvent = new CreateEventUseCase(eventRepository, noteRepository, noteBuilder, options.clock);
  return { database, eventRepository, noteRepository, noteBuilder, createEvent };
}
