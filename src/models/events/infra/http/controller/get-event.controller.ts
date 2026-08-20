import { getBearerToken } from "@/lib/auth/auth-header";
import { verifyFirebaseToken } from "@/lib/auth/verify-firebase-token";
import { GetEventUseCase } from "../../../application/usecases/get-event.usecase";

export class GetEventController {
  constructor(private readonly useCase: GetEventUseCase) {}

  async handle(request: Request, context: { params: Promise<{ eventId: string }> }): Promise<Response> {
    try {
      const actor = await verifyFirebaseToken(getBearerToken(request.headers));
      const { eventId } = await context.params;
      const event = await this.useCase.execute({ eventId }, actor);
      if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
      return Response.json(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      const status = message === "Only the event owner can modify it" ? 403 : 401;
      return Response.json({ error: message }, { status });
    }
  }
}
