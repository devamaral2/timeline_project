import { getBearerToken } from "@/lib/auth/auth-header";
import { verifyFirebaseToken } from "@/lib/auth/verify-firebase-token";
import { DeleteEventUseCase } from "../../../application/usecases/delete-event.usecase";

export class DeleteEventController {
  constructor(private readonly useCase: DeleteEventUseCase) {}

  async handle(request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
    try {
      const actor = await verifyFirebaseToken(getBearerToken(request.headers));
      const { eventId } = await context.params;
      await this.useCase.execute({ eventId }, actor);
      return new Response(null, { status: 204 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      const status = message === "Only the event owner can modify it" ? 403 : 401;
      return Response.json({ error: message }, { status });
    }
  }
}
