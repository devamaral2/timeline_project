import { Module } from "@nestjs/common";
import { NOTE_LINK_QUERY, NOTE_REPOSITORY } from "../../infrastructure/persistence";
import type { NoteLinkQuery, NoteRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ListNotesController } from "./list-notes.controller";
import { ListNotesUseCase } from "./list-notes.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListNotesController],
  providers: [{
    provide: ListNotesUseCase,
    inject: [NOTE_REPOSITORY, NOTE_LINK_QUERY],
    useFactory: (notes: NoteRepository, links: NoteLinkQuery) => new ListNotesUseCase(notes, links),
  }],
})
export class ListNotesModule {}
