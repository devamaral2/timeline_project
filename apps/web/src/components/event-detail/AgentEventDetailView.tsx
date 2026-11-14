"use client";

import type { EventDto } from "@repo/contracts";
import { BackLink, DetailFrame, DetailMessage } from "@/components/detail/detail-parts";
import { AgentEventHeader } from "./AgentEventHeader";
import { AgentInfoSection } from "./AgentInfoSection";
import { AgentRecordSection } from "./AgentRecordSection";
import { AgentStepsSection } from "./AgentStepsSection";
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
 *   - 46: Entradas (entre Informações e Passos); Produziu e Sessão (entre Passos e Registro);
 *   - 47: a falha e o campo do agente no rodapé, depois de Registro; "Cancelar pedido" na linha de status
 *     (no topo, em `AgentEventHeader`), e o menu "Mais ações" na barra do topo.
 */
export function AgentEventDetailView({ userId, event, onChanged }: AgentEventDetailViewProps) {
  const { request, load } = useAgentRequest(event.id, onChanged);

  const lead = (
    <>
      <nav className={styles.topbar} aria-label="Navegação do registro">
        <BackLink href={`/${userId}/tarefas`}>Voltar para Lista de tarefas</BackLink>
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
          {/* Ticket 46: Entradas. */}
          <AgentStepsSection steps={request.steps} />
          {/* Ticket 46: Produziu e Sessão. */}
          <AgentRecordSection request={request} />
          {/* Ticket 47: a falha do pedido e o campo do agente no rodapé. */}
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
