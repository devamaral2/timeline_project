import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ListTimelineEventsUseCase } from "../../application/usecases/list-timeline-events.usecase";
import { ListTimelineEventsController } from "../http/controller/list-timeline-events.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";

export function makeListTimelineEventsController(): ListTimelineEventsController {
  const repository = makeAdminFirestoreEventRepository(getAdminFirestore());
  return new ListTimelineEventsController(new ListTimelineEventsUseCase(repository));
}
