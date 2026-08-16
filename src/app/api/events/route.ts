import { makeListTimelineEventsController } from "@/models/events/infra/factories/make-list-timeline-events-controller";

export async function GET(request: Request): Promise<Response> {
  return makeListTimelineEventsController().handle(request);
}
