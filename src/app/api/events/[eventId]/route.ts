import { makeDeleteEventController } from "@/models/events/infra/factories/make-delete-event-controller";
import { makeUpdateEventController } from "@/models/events/infra/factories/make-update-event-controller";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return makeUpdateEventController().handle(request, context);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return makeDeleteEventController().handle(request, context);
}
