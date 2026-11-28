import { cancelRequestOperation } from "../features/cancel-request/cancel-request.route";
import { createArtifactOperation } from "../features/create-artifact/create-artifact.route";
import { createProjectOperation } from "../features/create-project/create-project.route";
import { createRecurrenceOperation } from "../features/create-recurrence/create-recurrence.route";
import { createTaskOperation } from "../features/create-task/create-task.route";
import { deliverTranscriptionOperation } from "../features/deliver-transcription/deliver-transcription.route";
import { deleteArtifactOperation } from "../features/delete-artifact/delete-artifact.route";
import { deleteRecurrenceOperation } from "../features/delete-recurrence/delete-recurrence.route";
import { deleteTaskOperation } from "../features/delete-task/delete-task.route";
import { getArtifactOperation } from "../features/get-artifact/get-artifact.route";
import { getModelOptionsOperation } from "../features/get-model-options/get-model-options.route";
import { getRecurrenceOperation } from "../features/get-recurrence/get-recurrence.route";
import { getRequestOperation } from "../features/get-request/get-request.route";
import { getTaskOperation } from "../features/get-task/get-task.route";
import { listAgendaTasksOperation } from "../features/list-agenda-tasks/list-agenda-tasks.route";
import { listArtifactsOperation } from "../features/list-artifacts/list-artifacts.route";
import { listProjectsOperation } from "../features/list-projects/list-projects.route";
import { listRecurrencesOperation } from "../features/list-recurrences/list-recurrences.route";
import { listRequestsOperation } from "../features/list-requests/list-requests.route";
import { listTrackedTasksOperation } from "../features/list-tracked-tasks/list-tracked-tasks.route";
import { renewTranscriptionLeaseOperation } from "../features/renew-transcription-lease/renew-transcription-lease.route";
import { requestTranscriptionOperation } from "../features/request-transcription/request-transcription.route";
import { reserveTranscriptionOperation } from "../features/reserve-transcription/reserve-transcription.route";
import { saveDailyReadingOperation } from "../features/save-daily-reading/save-daily-reading.route";
import { setTaskSituationOperation } from "../features/set-task-situation/set-task-situation.route";
import { startEditRequestOperation } from "../features/start-edit-request/start-edit-request.route";
import { startHermesRequestOperation } from "../features/start-hermes-request/start-hermes-request.route";
import { startModelRequestOperation } from "../features/start-model-request/start-model-request.route";
import { startRequestOperation } from "../features/start-request/start-request.route";
import { startVoiceRequestOperation } from "../features/start-voice-request/start-voice-request.route";
import { updateArtifactOperation } from "../features/update-artifact/update-artifact.route";
import { updateRecurrenceOperation } from "../features/update-recurrence/update-recurrence.route";
import { updateTaskOperation } from "../features/update-task/update-task.route";
import type { ApiRouteOperation } from "../http/api-route";

/**
 * As operacoes que ja respondem pelo Fastify, na ordem em que sao registradas.
 * As estaticas vem antes das parametrizadas. O catalogo OpenAPI e os testes de
 * arquitetura usam esta lista para nao depender de reflection dos controllers.
 */
export const DECLARED_API_OPERATIONS: readonly ApiRouteOperation[] = [
  listTrackedTasksOperation,
  listAgendaTasksOperation,
  createTaskOperation,
  // A Leitura diaria e o pedido de transcricao sao estaticas: vem antes de `/api/tasks/:taskId`.
  saveDailyReadingOperation,
  requestTranscriptionOperation,
  reserveTranscriptionOperation,
  renewTranscriptionLeaseOperation,
  deliverTranscriptionOperation,
  getTaskOperation,
  updateTaskOperation,
  setTaskSituationOperation,
  deleteTaskOperation,
  listProjectsOperation,
  createProjectOperation,
  listArtifactsOperation,
  createArtifactOperation,
  getArtifactOperation,
  updateArtifactOperation,
  deleteArtifactOperation,
  listRecurrencesOperation,
  createRecurrenceOperation,
  getRecurrenceOperation,
  updateRecurrenceOperation,
  deleteRecurrenceOperation,
  getModelOptionsOperation,
  listRequestsOperation,
  startRequestOperation,
  startEditRequestOperation,
  startHermesRequestOperation,
  startModelRequestOperation,
  startVoiceRequestOperation,
  getRequestOperation,
  cancelRequestOperation,
];

/** O caminho na forma do documento OpenAPI (`/api/tasks/:taskId` -> `/api/tasks/{taskId}`). */
export function openApiPath(path: string): string {
  return path.replace(/:(\w+)/g, "{$1}");
}

/** A chave da operacao no catalogo (`METODO /caminho`). */
export function declaredOperationKey(operation: Pick<ApiRouteOperation, "method" | "path">): string {
  return `${operation.method} ${openApiPath(operation.path)}`;
}
