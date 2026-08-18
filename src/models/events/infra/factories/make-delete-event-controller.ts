import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { DeleteEventUseCase } from "../../application/usecases/delete-event.usecase";
import { DeleteEventController } from "../http/controller/delete-event.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";

export function makeDeleteEventController(): DeleteEventController {
  const repository = makeAdminFirestoreEventRepository(getAdminFirestore());
  return new DeleteEventController(new DeleteEventUseCase(repository));
}
