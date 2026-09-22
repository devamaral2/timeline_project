import { Module } from "@nestjs/common";
import { RECURRENCE_REPOSITORY } from "../../infrastructure/persistence";
import type { RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetRecurrenceController } from "./get-recurrence.controller";
import { GetRecurrenceUseCase } from "./get-recurrence.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetRecurrenceController],
  providers: [{ provide: GetRecurrenceUseCase, inject: [RECURRENCE_REPOSITORY], useFactory: (recurrences: RecurrenceRepository) => new GetRecurrenceUseCase(recurrences) }],
})
export class GetRecurrenceModule {}
