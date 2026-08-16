import { getFirestore } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase/client-app";
import { ListTimelineEventsUseCase } from "../../application/usecases/list-timeline-events.usecase";
import { ListTimelineEventsController } from "../http/controller/list-timeline-events.controller";
import { makeFirestoreEventRepository } from "./make-firestore-event-repository";

export function makeListTimelineEventsController(): ListTimelineEventsController {
  const repository = makeFirestoreEventRepository(getFirestore(getClientApp()));
  return new ListTimelineEventsController(new ListTimelineEventsUseCase(repository));
}
