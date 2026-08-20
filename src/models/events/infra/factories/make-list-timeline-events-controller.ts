import { ListTimelineEventsController } from "../http/controller/list-timeline-events.controller";
import { makeListTimelineEventsUseCase } from "./make-list-timeline-events-usecase";

export function makeListTimelineEventsController(): ListTimelineEventsController {
  return new ListTimelineEventsController(makeListTimelineEventsUseCase());
}
