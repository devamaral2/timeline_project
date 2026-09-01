import type { TimelineEventPageDto } from "../contracts/timeline-event-page.dto";

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
