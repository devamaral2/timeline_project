import { Module } from "@nestjs/common";
import { RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ListRecurrencesController } from "./list-recurrences.controller";
import { ListRecurrencesUseCase } from "./list-recurrences.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListRecurrencesController],
  providers: [{
    provide: ListRecurrencesUseCase,
    inject: [RECURRENCE_REPOSITORY],
    useFactory: (recurrences: RecurrenceRepository) => new ListRecurrencesUseCase(recurrences),
  }],
})
export class ListRecurrencesModule {}
