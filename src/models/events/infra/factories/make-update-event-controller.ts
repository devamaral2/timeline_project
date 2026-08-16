import { getFirestore } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase/client-app";
import { UpdateEventUseCase } from "../../application/usecases/update-event.usecase";
import { StubFoodParsingGateway } from "../../application/usecases/test-doubles/stub-food-parsing.gateway";
import { UpdateEventController } from "../http/controller/update-event.controller";
import { makeFirestoreEventRepository } from "./make-firestore-event-repository";
import { makeFirestoreTagRepository } from "./make-firestore-tag-repository";

export function makeUpdateEventController(): UpdateEventController {
  const database = getFirestore(getClientApp());
  return new UpdateEventController(
    new UpdateEventUseCase(
      makeFirestoreEventRepository(database),
      makeFirestoreTagRepository(database),
      new StubFoodParsingGateway(),
    ),
  );
}
