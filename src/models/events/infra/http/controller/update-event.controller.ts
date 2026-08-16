import { getBearerToken } from "@/lib/auth/auth-header";
import { verifyFirebaseToken } from "@/lib/auth/verify-firebase-token";
import type { UpdateEventInput } from "../../../application/dtos/update-event.input";
import { UpdateEventUseCase } from "../../../application/usecases/update-event.usecase";

export class UpdateEventController {
  constructor(private readonly useCase: UpdateEventUseCase) {}

  async handle(request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
    try {
      const actor = await verifyFirebaseToken(getBearerToken(request.headers));
      const { eventId } = await context.params;
      const input = { ...((await request.json()) as UpdateEventInput), eventId };
      await this.useCase.execute(input, actor);
      return new Response(null, { status: 204 });
    } catch (error) {
      return mutationErrorResponse(error);
    }
  }
}

function mutationErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Invalid request";
  const status = message === "Only the event owner can modify it" ? 403 : 401;
  return Response.json({ error: message }, { status });
}
