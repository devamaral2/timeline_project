import { Module } from "@nestjs/common";
import { ARTIFACT_REPOSITORY, EVENT_REPOSITORY, EVENT_REQUEST_LINK_QUERY, RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { ArtifactRepository, EventRepository, EventRequestLinkQuery, RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetEventController } from "./get-event.controller";
import { GetEventUseCase } from "./get-event.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetEventController],
  providers: [{
    provide: GetEventUseCase,
    inject: [EVENT_REPOSITORY, ARTIFACT_REPOSITORY, RECURRENCE_REPOSITORY, EVENT_REQUEST_LINK_QUERY],
    useFactory: (
      events: EventRepository, artifacts: ArtifactRepository, recurrences: RecurrenceRepository, requestLinks: EventRequestLinkQuery,
    ) => new GetEventUseCase(events, artifacts, recurrences, requestLinks),
  }],
})
export class GetEventModule {}
