import type { AuthenticatedUser } from "../../request-identity/authenticated-user";
import type { DailyOverviewQuery } from "../../../domain/ports";
import type { DailyOverviewDto } from "@repo/contracts";
import {
  NO_RECURRENCES,
  type RecurrenceMaterializer,
} from "../../recurrences/usecases/materialize-recurrences.usecase";

const DAILY_OVERVIEW_TIME_ZONE = "America/Sao_Paulo";

export class GetDailyOverviewUseCase {
  constructor(
    private readonly dailyOverviewQuery: DailyOverviewQuery,
    private readonly recurrences: RecurrenceMaterializer = NO_RECURRENCES,
  ) {}

  async execute(input: { date: string }, actor: AuthenticatedUser): Promise<DailyOverviewDto> {
    // Meio-dia UTC do dia pedido cai no mesmo dia civil em qualquer fuso das Americas.
    await this.recurrences.materialize(actor.userId, new Date(`${input.date}T12:00:00.000Z`));
    return this.dailyOverviewQuery.get({
      userId: actor.userId,
      date: input.date,
      timeZone: DAILY_OVERVIEW_TIME_ZONE,
    });
  }
}
