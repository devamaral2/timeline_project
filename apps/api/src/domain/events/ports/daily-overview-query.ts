import type { DailyOverviewDto } from "@repo/contracts";

export interface DailyOverviewQueryParams {
  userId: string;
  /** O dia civil, `YYYY-MM-DD`. */
  date: string;
  timeZone: "America/Sao_Paulo";
}

export interface DailyOverviewQuery {
  get(params: DailyOverviewQueryParams): Promise<DailyOverviewDto>;
}
