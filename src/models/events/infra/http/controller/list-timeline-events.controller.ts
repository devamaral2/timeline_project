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
    const from = query.get("from");
    if (from && Number.isNaN(new Date(from).getTime())) {
      return Response.json({ error: "Invalid from date" }, { status: 400 });
    }
    const to = query.get("to");
    if (to && Number.isNaN(new Date(to).getTime())) {
      return Response.json({ error: "Invalid to date" }, { status: 400 });
    }

    const events = await this.useCase.execute({
      from: from ?? undefined,
      to: to ?? undefined,
      type: type as EventType | null ?? undefined,
      tag: query.get("tag") ?? undefined,
    });
    return Response.json(events);
  }
}
