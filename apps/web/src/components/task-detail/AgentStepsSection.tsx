"use client";

import type { RequestDto } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { TaskStatusGlyph, taskStatusName } from "@/components/tasks/task-status-glyph";
import { stepProgress } from "@/lib/tasks/agent-request-model";
import styles from "./agent-task-detail.module.css";

/**
 * A seção "Passos" do pedido: cada passo com o agente interno e o status. Os passos não são links nem se
 * editam; a contagem "feitos/total" vai no título da seção.
 */
export function AgentStepsSection({ steps }: { steps: RequestDto["steps"] }) {
  const { done, total } = stepProgress(steps);

  return (
    <DetailSection title="Passos" count={`${done}/${total}`} labelId="agent-steps">
      {steps.length === 0 ? (
        <DetailMessage>Ainda não há passos.</DetailMessage>
      ) : (
        <ol className={styles.steps} aria-label="Passos do pedido">
          {steps.map((step) => (
            <li key={step.id} className={styles.step}>
              <span aria-hidden className={styles.glyph}><TaskStatusGlyph actor="agent" status={step.status} size={16} /></span>
              <span className={styles.stepLabel}>{step.label}</span>
              <span className={styles.stepAgent}>{step.agent}</span>
              <span className={styles.stepStatus}>{taskStatusName("agent", step.status)}</span>
            </li>
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
