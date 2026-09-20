import { Module } from "@nestjs/common";
import { EVENT_REPOSITORY } from "../../infrastructure/persistence";
import type { EventRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetEventController } from "./get-event.controller";
import { GetEventUseCase } from "./get-event.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetEventController],
  providers: [{
    provide: GetEventUseCase,
    inject: [EVENT_REPOSITORY],
    useFactory: (events: EventRepository) => new GetEventUseCase(events),
  }],
})
export class GetEventModule {}
