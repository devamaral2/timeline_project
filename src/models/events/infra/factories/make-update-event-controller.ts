import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { UpdateEventUseCase } from "../../application/usecases/update-event.usecase";
import { OpenRouterFoodParsingGateway } from "../gateways/openrouter-food-parsing.gateway";
import { UpdateEventController } from "../http/controller/update-event.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";
import { makeAdminFirestoreTagRepository } from "./make-admin-firestore-tag-repository";

export function makeUpdateEventController(): UpdateEventController {
  const database = getAdminFirestore();
  return new UpdateEventController(
    new UpdateEventUseCase(
      makeAdminFirestoreEventRepository(database),
      makeAdminFirestoreTagRepository(database),
      new OpenRouterFoodParsingGateway(),
    ),
  );
}
