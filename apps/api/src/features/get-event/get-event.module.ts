import { Module } from "@nestjs/common";
import { ARTIFACT_REPOSITORY, EVENT_REPOSITORY, RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { ArtifactRepository, EventRepository, RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetEventController } from "./get-event.controller";
import { GetEventUseCase } from "./get-event.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetEventController],
  providers: [{
    provide: GetEventUseCase,
    inject: [EVENT_REPOSITORY, ARTIFACT_REPOSITORY, RECURRENCE_REPOSITORY],
    useFactory: (events: EventRepository, artifacts: ArtifactRepository, recurrences: RecurrenceRepository) =>
      new GetEventUseCase(events, artifacts, recurrences),
  }],
})
export class GetEventModule {}
