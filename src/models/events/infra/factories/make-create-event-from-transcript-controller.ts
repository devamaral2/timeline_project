import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { CreateEventFromTranscriptUseCase } from "../../application/usecases/create-event-from-transcript.usecase";
import { CreateEventUseCase } from "../../application/usecases/create-event.usecase";
import { OpenRouterEventCommandParsingGateway } from "../gateways/openrouter-event-command-parsing.gateway";
import { OpenRouterFoodParsingGateway } from "../gateways/openrouter-food-parsing.gateway";
import { CreateEventFromTranscriptController } from "../http/controller/create-event-from-transcript.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";
import { makeAdminFirestoreTagRepository } from "./make-admin-firestore-tag-repository";

export function makeCreateEventFromTranscriptController(): CreateEventFromTranscriptController {
  const database = getAdminFirestore();
  return new CreateEventFromTranscriptController(
    new CreateEventFromTranscriptUseCase(
      new OpenRouterEventCommandParsingGateway(),
      new CreateEventUseCase(
        makeAdminFirestoreEventRepository(database),
        makeAdminFirestoreTagRepository(database),
        new OpenRouterFoodParsingGateway(),
      ),
    ),
  );
}
