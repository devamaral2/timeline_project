import { ListTimelineEventsUseCase } from "../../../application/usecases/list-timeline-events.usecase";
import type { EventType } from "../../../domain/types/event-type";

const eventTypes: EventType[] = ["routine", "food", "training", "sleep"];

export class ListTimelineEventsController {
  constructor(private readonly useCase: ListTimelineEventsUseCase) {}

  async handle(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const type = query.get("type");
    if (type && !eventTypes.includes(type as EventType)) {
      return Response.json({ error: "Invalid event type" }, { status: 400 });
    }

    const events = await this.useCase.execute({
      from: query.get("from") ?? undefined,
      to: query.get("to") ?? undefined,
      type: type as EventType | null ?? undefined,
      tag: query.get("tag") ?? undefined,
    });
    return Response.json(events);
  }
}
