import { Module } from "@nestjs/common";
import { EVENT_REPOSITORY, NOTE_REPOSITORY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository, NoteRepository, TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetNoteController } from "./get-note.controller";
import { GetNoteUseCase } from "./get-note.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetNoteController],
  providers: [{
    provide: GetNoteUseCase,
    inject: [NOTE_REPOSITORY, EVENT_REPOSITORY, TASK_REPOSITORY],
    useFactory: (notes: NoteRepository, events: EventRepository, tasks: TaskRepository) =>
      new GetNoteUseCase(notes, { events, tasks }),
  }],
})
export class GetNoteModule {}
