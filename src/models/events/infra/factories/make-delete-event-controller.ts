import { getFirestore } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase/client-app";
import { DeleteEventUseCase } from "../../application/usecases/delete-event.usecase";
import { DeleteEventController } from "../http/controller/delete-event.controller";
import { makeFirestoreEventRepository } from "./make-firestore-event-repository";

export function makeDeleteEventController(): DeleteEventController {
  const repository = makeFirestoreEventRepository(getFirestore(getClientApp()));
  return new DeleteEventController(new DeleteEventUseCase(repository));
}
