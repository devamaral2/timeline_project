"use client";

import type { TaskDto } from "@repo/contracts";
import { BackLink, DetailFrame, DetailMessage } from "@/components/detail/detail-parts";
import { AgentTaskHeader } from "./AgentTaskHeader";
import { AgentEntriesSection } from "./AgentEntriesSection";
import { AgentFailureSection } from "./AgentFailureSection";
import { AgentRequestBar } from "./AgentRequestBar";
import { AgentInfoSection } from "./AgentInfoSection";
import { AgentProducedSection } from "./AgentProducedSection";
import { AgentRecordSection } from "./AgentRecordSection";
import { AgentSessionSection } from "./AgentSessionSection";
import { AgentStepsSection } from "./AgentStepsSection";
import { TaskSequenceSection } from "./TaskSequenceSection";
import { useAgentRequest } from "./use-agent-request";
import styles from "./task-detail.module.css";

interface AgentTaskDetailViewProps {
  userId: string;
  task: TaskDto;
  /** Relê a tarefa. A releitura do pedido em aberto chama isto a cada batida, para pegar a conclusão. */
  onChanged: () => Promise<void>;
}

/**
 * O detalhe da tarefa de agente: a forma do agente, sem edição. Os dados vêm da tarefa e, por cima, do pedido
 * com o mesmo id. A tela é uma coluna de seções separadas, e as próximas acrescentam as suas nos lugares marcados:
 *   - 47: a falha e o campo do agente no rodapé, depois de Registro; "Cancelar pedido" na linha de status
 *     (no topo, em `AgentTaskHeader`), e o menu "Mais ações" na barra do topo.
 */
export function AgentTaskDetailView({ userId, task, onChanged }: AgentTaskDetailViewProps) {
  const { request, load, applyRequest } = useAgentRequest(task.id, onChanged);

  const lead = (
    <>
      <nav className={styles.topbar} aria-label="Navegação do registro">
        <BackLink href={`/${userId}/tarefas`} label="Voltar para Lista de tarefas" />
        <span className={styles.topbarTitle}>Tarefa</span>
        <div className={styles.topbarActions} />
      </nav>
      {request ? <AgentTaskHeader task={task} request={request} /> : null}
    </>
  );

  return (
    <DetailFrame type={task.kind} leadLabel="Resumo da tarefa" bodyLabel="Conteúdo da tarefa" lead={lead}>
      {request ? (
        <>
          <AgentInfoSection task={task} />
          <TaskSequenceSection userId={userId} task={task} />
          <AgentEntriesSection entries={request.trace?.entries ?? []} />
          <AgentStepsSection steps={request.steps} />
          <AgentProducedSection userId={userId} entities={request.entities} />
          <AgentSessionSection sessionId={request.sessionId} />
          <AgentRecordSection request={request} />
          <AgentFailureSection request={request} />
          <AgentRequestBar userId={userId} request={request} onRequestChange={applyRequest} />
        </>
      ) : load === "missing" ? (
        <DetailMessage alert>Pedido não encontrado.</DetailMessage>
      ) : load === "error" ? (
        <DetailMessage alert>Não foi possível carregar o pedido. Tente novamente.</DetailMessage>
      ) : (
        <DetailMessage>Carregando pedido…</DetailMessage>
      )}
    </DetailFrame>
  );
}
