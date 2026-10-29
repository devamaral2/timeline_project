import type { AiProcessDto } from "@repo/contracts";
import type { ProcessEntityRecord, ProcessRecord, ProcessResponse, StepRecord } from "./process-store";
import { stepLabel, uiConfig } from "./process-config";

/** O que o cliente mostra: a caixa de processo, toda com texto predefinido. O contrato e compartilhado. */
export type ProcessView = AiProcessDto;

function messageOf(response: ProcessResponse | undefined): string | undefined {
  if (!response) return undefined;
  if (response.text) return response.text;
  if (response.failedSteps.length === 0) return undefined;
  if (response.explanation) return response.explanation;
  return response.failedSteps
    .map((step) => uiConfig.failure.replace("{{label}}", stepLabel(step.agent).toLowerCase()))
    .join("\n");
}

export function toProcessView(
  process: ProcessRecord,
  steps: readonly StepRecord[],
  entities: readonly ProcessEntityRecord[],
): ProcessView {
  return {
    id: process.id,
    status: process.status,
    title: uiConfig.title,
    steps: steps.map((step) => ({
      id: step.id, agent: step.agent, label: stepLabel(step.agent), status: step.status,
      ...(step.errorCode ? { errorCode: step.errorCode } : {}),
      ...(step.result ? { result: step.result } : {}),
    })),
    entities: entities.map((entity) => ({
      kind: entity.kind, id: entity.id, name: entity.summary.name, operation: entity.operation,
      linkedTo: entity.links.map((link) => (link.from.id === entity.id ? link.to : link.from)),
    })),
    message: messageOf(process.response),
  };
}
