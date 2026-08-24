import { getBearerToken } from "@/lib/auth/auth-header";
import { verifyFirebaseToken, type AuthenticatedUser } from "@/lib/auth/verify-firebase-token";
import {
  CreateEventFromTranscriptUseCase,
  EMPTY_TRANSCRIPT_ERROR,
  LONG_TRANSCRIPT_ERROR,
} from "../../../application/usecases/create-event-from-transcript.usecase";

const BAD_REQUEST_MESSAGES = new Set<string>([
  EMPTY_TRANSCRIPT_ERROR,
  LONG_TRANSCRIPT_ERROR,
  "Invalid JSON body",
]);

export class CreateEventFromTranscriptController {
  constructor(private readonly useCase: CreateEventFromTranscriptUseCase) {}

  async handle(request: Request): Promise<Response> {
    let actor: AuthenticatedUser;
    try {
      actor = await verifyFirebaseToken(getBearerToken(request.headers));
    } catch (error) {
      return errorResponse(error, 401);
    }

    try {
      const body = await readBody(request);
      const result = await this.useCase.execute({ transcript: body.transcript ?? "" }, actor);
      return Response.json(result, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      // Falha do modelo ou do banco nao e culpa do cliente: 502 deixa o retry na UI fazer sentido.
      return errorResponse(error, BAD_REQUEST_MESSAGES.has(message) ? 400 : 502);
    }
  }
}

async function readBody(request: Request): Promise<{ transcript?: string }> {
  try {
    return (await request.json()) as { transcript?: string };
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function errorResponse(error: unknown, status: number): Response {
  const message = error instanceof Error ? error.message : "Invalid request";
  console.error("[CreateEventFromTranscriptController] request failed", {
    status,
    name: error instanceof Error ? error.name : typeof error,
    message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return Response.json({ error: message }, { status });
}
