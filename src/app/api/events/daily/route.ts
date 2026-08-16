import { makeGetDailyOverviewController } from "@/models/events/infra/factories/make-get-daily-overview-controller";

export async function GET(request: Request): Promise<Response> {
  return makeGetDailyOverviewController().handle(request);
}
