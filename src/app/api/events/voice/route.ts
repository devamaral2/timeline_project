import { makeCreateEventFromTranscriptController } from "@/models/events/infra/factories/make-create-event-from-transcript-controller";

export async function POST(request: Request): Promise<Response> {
  return makeCreateEventFromTranscriptController().handle(request);
}
