import { Module } from "@nestjs/common";
import { DAILY_OVERVIEW_QUERY } from "../../infrastructure/persistence";
import type { DailyOverviewQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { GetDailyOverviewController } from "./get-daily-overview.controller";
import { GetDailyOverviewUseCase } from "./get-daily-overview.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetDailyOverviewController],
  providers: [
    {
      provide: GetDailyOverviewUseCase,
      inject: [DAILY_OVERVIEW_QUERY, MaterializeRecurrencesUseCase],
      useFactory: (query: DailyOverviewQuery, materializer: MaterializeRecurrencesUseCase) =>
        new GetDailyOverviewUseCase(query, materializer),
    },
  ],
})
export class GetDailyOverviewModule {}
