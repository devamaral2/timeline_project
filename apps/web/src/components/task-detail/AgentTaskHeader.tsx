"use client";

import type { TaskDto, RequestDto, TaskSituation } from "@repo/contracts";
import { Bot } from "lucide-react";
import { useState } from "react";
import { SituationMenu } from "@/components/tasks/situation-menu";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskSituationGlyph, situationNames } from "@/components/tasks/task-situation";
import { TaskStatusGlyph, taskStatusName } from "@/components/tasks/task-status-glyph";
import { setTaskSituation } from "@/lib/api/tasks";
import styles from "./task-detail.module.css";

interface AgentTaskHeaderProps {
  task: TaskDto;
  request: RequestDto;
  /** O pedido com a situação nova: a mudança aparece na hora e é desfeita quando a gravação falha. */
  onRequestChange: (request: RequestDto) => void;
}

const SITUATION_FAILURE = "Não foi possível mudar a situação. Tente novamente.";

/**
 * O topo da tarefa de agente: o código do tipo, o título, o status do agente solto na linha (sem pílula), o
 * controle de situação (só quando o pedido terminou) e o robô na ponta direita como assinatura, igual à linha da
 * agenda. O projeto fica nas Informações, só para leitura. Prioridade e "N de M passos" não aparecem aqui (os
 * passos têm a sua seção). Não há lápis nem troca de status: quem executa é o agente. A situação é do usuário: o
 * controle abre as três opções logo abaixo e qualquer uma vale a partir de qualquer outra.
 */
export function AgentTaskHeader({ task, request, onRequestChange }: AgentTaskHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const situation = request.situation;

  async function change(next: TaskSituation) {
    setMenuOpen(false);
    if (!situation || next === situation) return;
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
        <span className={styles.agentStatus}>
          <span aria-hidden className={styles.glyph}><TaskStatusGlyph actor="agent" status={request.status} size={16} /></span>
          {taskStatusName("agent", request.status)}
        </span>
        {situation ? (
          <button
            type="button"
            className={styles.situationControl}
            aria-label={`${situationNames[situation]}. Mudar situação`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span aria-hidden className={styles.glyph}><TaskSituationGlyph situation={situation} size={16} /></span>
            {situationNames[situation]}
          </button>
        ) : null}
        <Bot className={styles.agentMark} size={20} strokeWidth={1.9} aria-hidden="true" data-agent-mark />
      </div>
      {menuOpen && situation ? <SituationMenu value={situation} onPick={(next) => void change(next)} /> : null}
      {failed ? <p role="alert" className={styles.situationFailure}>{SITUATION_FAILURE}</p> : null}
    </header>
  );
}
