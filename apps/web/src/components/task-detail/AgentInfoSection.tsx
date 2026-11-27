"use client";

import type { TaskDto } from "@repo/contracts";
import { DetailFact, DetailFacts, DetailSection } from "@/components/detail/detail-parts";
import { ProjectLine } from "@/components/projects/project-line";
import { useNow } from "@/lib/tasks/use-now";
import { elapsedLabel } from "@/lib/tasks/card-text";
import { momentLabel } from "@/lib/tasks/task-read-model";
import styles from "./task-detail.module.css";

/**
 * A seção "Informações" da tarefa de agente: o projeto, o início, com o tempo decorrido, e a conclusão, ou "ainda não
 * concluído". Fim estimado e Job não entram: o contrato não traz esses dados.
 */
export function AgentInfoSection({ task }: { task: TaskDto }) {
  const now = useNow();

  return (
    <DetailSection title="Informações" labelId="agent-info">
      <DetailFacts label="Informações">
        {/* Só leitura: o projeto de uma tarefa de agente não muda depois que ela nasce. */}
        <DetailFact label="Projeto"><ProjectLine project={task.project} /></DetailFact>
        <DetailFact label="Início">
          {task.startedAt ? (
            <span className={styles.stack}>
              <span className={styles.value}>{momentLabel(task.startedAt)}</span>
              {now ? <span className={styles.sub}>{elapsedLabel(task.startedAt, now)}</span> : null}
            </span>
          ) : "sem data"}
        </DetailFact>
        <DetailFact label="Concluído">{task.finishedAt ? momentLabel(task.finishedAt) : "ainda não concluído"}</DetailFact>
      </DetailFacts>
    </DetailSection>
  );
}
