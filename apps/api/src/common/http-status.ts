import {
  AgentLimitReachedError,
  AgentTargetForbiddenError,
  InvalidInputError,
  LlmUnavailableError,
} from "../api-core/agent/errors/agent.errors";
import { TranscriptionLeaseLostError } from "../api-core/transcription/transcription-requests";
import {
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  ArtifactValidationError,
  EntityBatchConflictError,
  ProjectNameTakenError,
  ProjectNotFoundError,
  ProjectValidationError,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  RecurrenceValidationError,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskRevisionConflictError,
  TaskSituationNotAllowedError,
  TaskValidationError,
} from "../domain";
import { HttpError } from "./http-errors";

/**
 * Traduz o erro para o status HTTP. Independente do transporte: o filtro do
 * Nest hoje e o error handler do Fastify depois chamam a mesma tabela, na mesma
 * ordem. O 500 e a reserva: erro inesperado nunca vira 401.
 */
export function httpStatusFor(error: unknown): number {
  if (error instanceof HttpError) return error.status;
  if (error instanceof InvalidInputError) return 400;
  if (error instanceof LlmUnavailableError) return 502;
  if (error instanceof AgentTargetForbiddenError) return 403;
  if (error instanceof AgentLimitReachedError) return 422;
  if (error instanceof EntityBatchConflictError) return 409;
  if (error instanceof TranscriptionLeaseLostError) return 409;
  if (error instanceof ArtifactValidationError) return 400;
  if (error instanceof ArtifactOwnershipError) return 403;
  if (error instanceof ArtifactNotFoundError) return 404;
  if (error instanceof ArtifactRevisionConflictError) return 409;
  if (error instanceof ProjectValidationError) return 400;
  if (error instanceof ProjectNameTakenError) return 409;
  if (error instanceof ProjectNotFoundError) return 404;
  if (error instanceof TaskValidationError) return 400;
  if (error instanceof TaskOwnershipError) return 403;
  if (error instanceof TaskNotFoundError) return 404;
  if (error instanceof TaskRevisionConflictError) return 409;
  if (error instanceof TaskSituationNotAllowedError) return 409;
  if (error instanceof RecurrenceValidationError) return 400;
  if (error instanceof RecurrenceOwnershipError) return 403;
  if (error instanceof RecurrenceNotFoundError) return 404;
  if (error instanceof RecurrenceRevisionConflictError) return 409;
  return 500;
}
