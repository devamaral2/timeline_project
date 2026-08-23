import { getBearerToken } from "@/lib/auth/auth-header";
import { verifyFirebaseToken } from "@/lib/auth/verify-firebase-token";
import {
  EventAgentUndecidedError,
  InvalidInputError,
  LlmUnavailableError,
} from "../../../application/errors/event-agent.errors";
import type { CreateEventFromTextUseCase } from "../../../application/usecases/create-event-from-text.usecase";

export class CreateEventFromTextController {
  constructor(private readonly useCase: CreateEventFromTextUseCase) {}

  async handle(request: Request): Promise<Response> {
    try {
      const actor = await verifyFirebaseToken(getBearerToken(request.headers));
      const body = (await request.json().catch(() => null)) as { text?: unknown } | null;

      if (typeof body?.text !== "string") {
        throw new InvalidInputError("O campo 'text' é obrigatório e deve ser uma string");
      }

      const result = await this.useCase.execute({ text: body.text }, actor);
      return Response.json(result, { status: 201 });
    } catch (error) {
      console.error("[CreateEventFromTextController] request failed", {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : error,
      });
      return errorResponse(error);
    }
  }
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Invalid request";

  if (error instanceof InvalidInputError) return json(message, 400);
  if (error instanceof EventAgentUndecidedError) return json(message, 422);
  if (error instanceof LlmUnavailableError) return json(message, 502);

  // Sobra o caminho de autenticação: verifyFirebaseToken e getBearerToken lançam
  // erros do firebase-admin, sem tipo próprio para discriminar aqui.
  return json(message, 401);
}

function json(error: string, status: number): Response {
  return Response.json({ error }, { status });
}
