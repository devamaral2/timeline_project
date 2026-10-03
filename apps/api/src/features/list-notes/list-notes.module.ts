import { Module } from "@nestjs/common";
import { EVENT_REPOSITORY, NOTE_REPOSITORY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository, NoteRepository, TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ListNotesController } from "./list-notes.controller";
import { ListNotesUseCase } from "./list-notes.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListNotesController],
  providers: [{
    provide: ListNotesUseCase,
    inject: [NOTE_REPOSITORY, EVENT_REPOSITORY, TASK_REPOSITORY],
    useFactory: (notes: NoteRepository, events: EventRepository, tasks: TaskRepository) =>
      new ListNotesUseCase(notes, { events, tasks }),
  }],
})
export class ListNotesModule {}
