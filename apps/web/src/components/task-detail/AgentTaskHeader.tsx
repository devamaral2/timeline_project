"use client";

import type { TaskDto, RequestDto, TaskSituation } from "@repo/contracts";
import { useState } from "react";
import { agentStatusNames } from "@/components/tasks/agent-status-names";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskSituationGlyph, situationNames, situationOptions } from "@/components/tasks/task-situation";
import { TaskStatusGlyph } from "@/components/tasks/task-status-glyph";
import { setTaskSituation } from "@/lib/api/tasks";
import { TaskChoice } from "./TaskChoice";
import styles from "./task-detail.module.css";

interface AgentTaskHeaderProps {
  task: TaskDto;
  request: RequestDto;
  /** O pedido com a situação nova: a mudança aparece na hora e é desfeita quando a gravação falha. */
  onRequestChange: (request: RequestDto) => void;
}

const SITUATION_FAILURE = "Não foi possível mudar a situação. Tente novamente.";

/**
 * O topo da tarefa de agente: o código do tipo, o título e uma linha com o controle de situação na ponta esquerda (só
 * quando o pedido terminou) e o status do agente, solto (sem pílula) e só com o nome dele ("Concluído"), na ponta direita. O projeto fica nas Informações. Prioridade e "N de M passos" não aparecem aqui (os passos têm a sua
 * seção). Não há lápis nem troca de status: quem executa é o agente. A situação é do usuário: o controle é o mesmo
 * seletor do status de pessoa (a pílula com a seta e a lista com a atual marcada) e qualquer uma vale a partir de
 * qualquer outra.
 */
export function AgentTaskHeader({ task, request, onRequestChange }: AgentTaskHeaderProps) {
  const [failed, setFailed] = useState(false);
  const situation = request.situation;

  async function change(next: TaskSituation) {
    if (!situation) return;
    setFailed(false);
    onRequestChange({ ...request, situation: next });
    try {
      await setTaskSituation(task.id, next);
    } catch {
      onRequestChange({ ...request, situation });
      setFailed(true);
    }
  }

  return (
    <header className={styles.header}>
      <TaskKindMark kind={task.kind} />
      <h1 className={styles.title}>{task.name}</h1>
      <div className={styles.chips}>
        {situation ? (
          <TaskChoice<TaskSituation>
            value={situation}
            ariaLabel={`${situationNames[situation]}. Mudar situação`}
            listLabel="Situação da tarefa"
            options={situationOptions()}
            trigger={
              <>
                <span aria-hidden className={styles.glyph}><TaskSituationGlyph situation={situation} size={18} /></span>
                {situationNames[situation]}
              </>
            }
            onChange={(next) => void change(next)}
          />
        ) : null}
        <span className={styles.agentStatus}>
          <span aria-hidden className={styles.glyph}><TaskStatusGlyph actor="agent" status={request.status} size={16} /></span>
          {agentStatusNames[request.status]}
        </span>
      </div>
      {failed ? <p role="alert" className={styles.situationFailure}>{SITUATION_FAILURE}</p> : null}
    </header>
  );
}
