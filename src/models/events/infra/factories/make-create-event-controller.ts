import { getFirestore } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase/client-app";
import { CreateEventUseCase } from "../../application/usecases/create-event.usecase";
import { StubFoodParsingGateway } from "../../application/usecases/test-doubles/stub-food-parsing.gateway";
import { CreateEventController } from "../http/controller/create-event.controller";
import { makeFirestoreEventRepository } from "./make-firestore-event-repository";
import { makeFirestoreTagRepository } from "./make-firestore-tag-repository";

export function makeCreateEventController(): CreateEventController {
  const database = getFirestore(getClientApp());
  return new CreateEventController(
    new CreateEventUseCase(
      makeFirestoreEventRepository(database),
      makeFirestoreTagRepository(database),
      new StubFoodParsingGateway(),
    ),
  );
}
