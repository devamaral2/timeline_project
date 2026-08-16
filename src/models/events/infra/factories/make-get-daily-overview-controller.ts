import { getFirestore } from "firebase/firestore";
import { getClientApp } from "@/lib/firebase/client-app";
import { GetDailyOverviewUseCase } from "../../application/usecases/get-daily-overview.usecase";
import { GetDailyOverviewController } from "../http/controller/get-daily-overview.controller";
import { makeFirestoreEventRepository } from "./make-firestore-event-repository";

export function makeGetDailyOverviewController(): GetDailyOverviewController {
  const repository = makeFirestoreEventRepository(getFirestore(getClientApp()));
  return new GetDailyOverviewController(new GetDailyOverviewUseCase(repository));
}
