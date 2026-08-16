import { makeListTimelineEventsController } from "@/models/events/infra/factories/make-list-timeline-events-controller";
import { makeCreateEventController } from "@/models/events/infra/factories/make-create-event-controller";

export async function GET(request: Request): Promise<Response> {
  return makeListTimelineEventsController().handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return makeCreateEventController().handle(request);
}
