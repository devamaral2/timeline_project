import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { DailyOverviewQuery } from "@repo/entities/ports";
import type { DailyOverviewDto } from "@repo/entities/contracts";

const DAILY_OVERVIEW_TIME_ZONE = "America/Sao_Paulo";

export class GetDailyOverviewUseCase {
  constructor(private readonly dailyOverviewQuery: DailyOverviewQuery) {}

  async execute(input: { date: string }, actor: AuthenticatedUser): Promise<DailyOverviewDto> {
    return this.dailyOverviewQuery.get({
      userId: actor.userId,
      date: input.date,
      timeZone: DAILY_OVERVIEW_TIME_ZONE,
    });
  }
}
