"use client";

import type { RequestDto } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { agentFailureText } from "@/lib/agent-chat/use-agent-chat";

/**
 * A seção "Falha" do pedido que falhou: o motivo, pelo mesmo texto que o chat mostra para o código do erro.
 * Só aparece com o pedido em estado de falha.
 */
export function AgentFailureSection({ request }: { request: RequestDto }) {
  if (request.status !== "failed") return null;

  return (
    <DetailSection title="Falha" labelId="agent-failure">
      <DetailMessage alert>{agentFailureText(request.errorCode ?? "internal")}</DetailMessage>
    </DetailSection>
  );
}
