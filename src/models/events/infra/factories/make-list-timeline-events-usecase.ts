import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ListTimelineEventsUseCase } from "../../application/usecases/list-timeline-events.usecase";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";

export function makeListTimelineEventsUseCase(): ListTimelineEventsUseCase {
  return new ListTimelineEventsUseCase(makeAdminFirestoreEventRepository(getAdminFirestore()));
}
