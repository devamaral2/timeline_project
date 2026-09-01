import type { DailyOverviewDto } from "../contracts/daily-overview.dto";

export interface DailyOverviewQueryParams {
  userId: string;
  date: string;
  timeZone: "America/Sao_Paulo";
}

export interface DailyOverviewQuery {
  get(params: DailyOverviewQueryParams): Promise<DailyOverviewDto>;
}
