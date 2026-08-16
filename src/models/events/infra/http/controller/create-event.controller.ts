import { getBearerToken } from "@/lib/auth/auth-header";
import { verifyFirebaseToken } from "@/lib/auth/verify-firebase-token";
import type { CreateEventInput } from "../../../application/dtos/create-event.input";
import { CreateEventUseCase } from "../../../application/usecases/create-event.usecase";

export class CreateEventController {
  constructor(private readonly useCase: CreateEventUseCase) {}

  async handle(request: Request): Promise<Response> {
    try {
      const actor = await verifyFirebaseToken(getBearerToken(request.headers));
      const result = await this.useCase.execute((await request.json()) as CreateEventInput, actor);
      return Response.json(result, { status: 201 });
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
