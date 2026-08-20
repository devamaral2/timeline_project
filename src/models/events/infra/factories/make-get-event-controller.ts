import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { GetEventUseCase } from "../../application/usecases/get-event.usecase";
import { GetEventController } from "../http/controller/get-event.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";

export function makeGetEventController(): GetEventController {
  const database = getAdminFirestore();
  return new GetEventController(new GetEventUseCase(makeAdminFirestoreEventRepository(database)));
}
