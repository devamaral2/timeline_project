import { Module } from "@nestjs/common";
import { NOTE_LINK_QUERY, NOTE_REPOSITORY } from "../../infrastructure/persistence";
import type { NoteLinkQuery, NoteRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetNoteController } from "./get-note.controller";
import { GetNoteUseCase } from "./get-note.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetNoteController],
  providers: [{
    provide: GetNoteUseCase,
    inject: [NOTE_REPOSITORY, NOTE_LINK_QUERY],
    useFactory: (notes: NoteRepository, links: NoteLinkQuery) => new GetNoteUseCase(notes, links),
  }],
})
export class GetNoteModule {}
