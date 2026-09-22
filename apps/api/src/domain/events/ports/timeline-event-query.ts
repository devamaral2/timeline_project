import type { TimelineEventPageDto } from "@repo/contracts";

export interface TimelineQueryParams {
  userId: string;
  from?: Date;
  to?: Date;
  type?: string;
  tag?: string;
  cursor?: string;
  limit: number;
}

export interface TimelineEventQuery {
  list(params: TimelineQueryParams): Promise<TimelineEventPageDto>;
}
