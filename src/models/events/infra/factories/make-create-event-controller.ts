import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { CreateEventUseCase } from "../../application/usecases/create-event.usecase";
import { OpenRouterFoodParsingGateway } from "../gateways/openrouter-food-parsing.gateway";
import { CreateEventController } from "../http/controller/create-event.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";
import { makeAdminFirestoreTagRepository } from "./make-admin-firestore-tag-repository";

export function makeCreateEventController(): CreateEventController {
  const database = getAdminFirestore();
  return new CreateEventController(
    new CreateEventUseCase(
      makeAdminFirestoreEventRepository(database),
      makeAdminFirestoreTagRepository(database),
      new OpenRouterFoodParsingGateway(),
    ),
  );
}
