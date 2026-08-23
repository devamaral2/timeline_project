import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { CreateEventFromTextUseCase } from "../../application/usecases/create-event-from-text.usecase";
import { CreateEventUseCase } from "../../application/usecases/create-event.usecase";
import { OpenRouterEventAgentGateway } from "../gateways/openrouter-event-agent.gateway";
import { OpenRouterFoodParsingGateway } from "../gateways/openrouter-food-parsing.gateway";
import { CreateEventFromTextController } from "../http/controller/create-event-from-text.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";
import { makeAdminFirestoreTagRepository } from "./make-admin-firestore-tag-repository";

export function makeCreateEventFromTextController(): CreateEventFromTextController {
  const database = getAdminFirestore();
  const createEventUseCase = new CreateEventUseCase(
    makeAdminFirestoreEventRepository(database),
    makeAdminFirestoreTagRepository(database),
    new OpenRouterFoodParsingGateway(),
  );

  return new CreateEventFromTextController(
    new CreateEventFromTextUseCase(new OpenRouterEventAgentGateway(), createEventUseCase),
  );
}
