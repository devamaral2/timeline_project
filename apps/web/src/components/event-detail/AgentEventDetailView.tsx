"use client";

import type { EventDto } from "@repo/contracts";
import { BackLink, DetailFrame, DetailMessage } from "@/components/detail/detail-parts";
import { AgentEventHeader } from "./AgentEventHeader";
import { AgentEntriesSection } from "./AgentEntriesSection";
import { AgentFailureSection } from "./AgentFailureSection";
import { AgentRequestBar } from "./AgentRequestBar";
import { AgentInfoSection } from "./AgentInfoSection";
import { AgentProducedSection } from "./AgentProducedSection";
import { AgentRecordSection } from "./AgentRecordSection";
import { AgentSessionSection } from "./AgentSessionSection";
import { AgentStepsSection } from "./AgentStepsSection";
import { EventSequenceSection } from "./EventSequenceSection";
import { useAgentRequest } from "./use-agent-request";
import styles from "./event-detail.module.css";

interface AgentEventDetailViewProps {
  userId: string;
  event: EventDto;
  /** Relê o evento. A releitura do pedido em aberto chama isto a cada batida, para pegar a conclusão. */
  onChanged: () => Promise<void>;
}

/**
 * O detalhe do evento de agente: a forma do agente, sem edição. Os dados vêm do evento e, por cima, do pedido
 * com o mesmo id. A tela é uma coluna de seções separadas, e as próximas acrescentam as suas nos lugares marcados:
 *   - 47: a falha e o campo do agente no rodapé, depois de Registro; "Cancelar pedido" na linha de status
 *     (no topo, em `AgentEventHeader`), e o menu "Mais ações" na barra do topo.
 */
export function AgentEventDetailView({ userId, event, onChanged }: AgentEventDetailViewProps) {
  const { request, load, applyRequest } = useAgentRequest(event.id, onChanged);

  const lead = (
    <>
      <nav className={styles.topbar} aria-label="Navegação do registro">
        <BackLink href={`/${userId}/tarefas`} label="Voltar para Lista de tarefas" />
        <span className={styles.topbarTitle}>Evento</span>
        <div className={styles.topbarActions} />
      </nav>
      {request ? <AgentEventHeader event={event} request={request} /> : null}
    </>
  );

  return (
    <DetailFrame type={event.kind} leadLabel="Resumo do evento" bodyLabel="Conteúdo do evento" lead={lead}>
      {request ? (
        <>
          <AgentInfoSection event={event} />
          <EventSequenceSection userId={userId} event={event} />
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
