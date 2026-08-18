import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { GetDailyOverviewUseCase } from "../../application/usecases/get-daily-overview.usecase";
import { GetDailyOverviewController } from "../http/controller/get-daily-overview.controller";
import { makeAdminFirestoreEventRepository } from "./make-admin-firestore-event-repository";

export function makeGetDailyOverviewController(): GetDailyOverviewController {
  const repository = makeAdminFirestoreEventRepository(getAdminFirestore());
  return new GetDailyOverviewController(new GetDailyOverviewUseCase(repository));
}
