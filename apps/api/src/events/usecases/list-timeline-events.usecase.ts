import type { AuthenticatedUser } from "../../auth/verify-firebase-token";
import type { TimelineEventQuery } from "@repo/entities/ports";
import type { TimelineEventPageDto } from "@repo/entities/contracts";

const DEFAULT_LIMIT = 50;

export class ListTimelineEventsUseCase {
  constructor(private readonly timelineEventQuery: TimelineEventQuery) {}

  async execute(
    input: {
      from?: string;
      to?: string;
      type?: string;
      tag?: string;
      cursor?: string;
      limit?: number;
    },
    actor: AuthenticatedUser,
  ): Promise<TimelineEventPageDto> {
    return this.timelineEventQuery.list({
      userId: actor.userId,
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
      type: input.type,
      tag: input.tag,
      cursor: input.cursor,
      limit: input.limit ?? DEFAULT_LIMIT,
    });
  }
}
