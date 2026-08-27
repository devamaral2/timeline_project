import type { EventRepository } from "@repo/entities/ports";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import type { EventType } from "@repo/entities";

const presentationByType: Record<EventType, { accentColor: string; iconName: string }> = {
  routine: { accentColor: "blue", iconName: "clock" },
  food: { accentColor: "orange", iconName: "utensils" },
  training: { accentColor: "red", iconName: "dumbbell" },
  sleep: { accentColor: "indigo", iconName: "moon" },
};

export class ListTimelineEventsUseCase {
  constructor(private readonly eventRepository: EventRepository) {}

  async execute(input: {
    userId: string;
    from?: string;
    to?: string;
    type?: EventType;
    tag?: string;
  }): Promise<TimelineEventCardDto[]> {
    const events = await this.eventRepository.listTimeline({
      userId: input.userId,
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
      type: input.type,
      tag: input.tag,
    });
    return events.map((event) => ({
      id: event.id,
      type: event.type,
      ...presentationByType[event.type],
      name: event.name,
      description: event.description,
      startedAt: event.startedAt.toISOString(),
      finishedAt: event.finishedAt?.toISOString(),
      durationLabel: formatDuration(event.getDurationMinutes()),
      tags: event.tags,
      interruptions: event.interruptions.map((interruption) => ({
        name: interruption.name,
        description: interruption.description,
        durationLabel: formatDuration(
          Math.round((interruption.finishedAt.getTime() - interruption.startedAt.getTime()) / 60000),
        ),
      })),
    }));
  }
}

function formatDuration(durationMinutes: number | null): string {
  if (durationMinutes === null) return "--";
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`;
}
