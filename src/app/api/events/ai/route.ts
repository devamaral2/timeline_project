import { makeCreateEventFromTextController } from "@/models/events/infra/factories/make-create-event-from-text-controller";

export async function POST(request: Request): Promise<Response> {
  return makeCreateEventFromTextController().handle(request);
}
