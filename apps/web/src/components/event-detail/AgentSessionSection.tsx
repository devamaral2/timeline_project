"use client";

import type { RequestDto } from "@repo/contracts";
import { useEffect, useState } from "react";
import { DetailFact, DetailFacts, DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { getRequest } from "@/lib/api/requests";
import { momentLabel } from "@/lib/events/event-read-model";
import styles from "./agent-event-detail.module.css";

/**
 * A seção "Sessão" do pedido: de qual pedido este continua. O primeiro pedido da sessão é lido pelo id que o
 * pedido traz; a API não tem consulta para as continuações, então esta seção não as lista. Sem `sessionId`,
 * a seção não aparece.
 */
export function AgentSessionSection({ sessionId }: { sessionId: string | undefined }) {
  const [first, setFirst] = useState<RequestDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (sessionId === undefined) return;
    let cancelled = false;
    setFirst(null);
    setFailed(false);
    getRequest(sessionId).then(
      (loaded) => {
        if (!cancelled) setFirst(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (sessionId === undefined) return null;

  return (
    <DetailSection title="Sessão" labelId="agent-session">
      {first ? (
        <DetailFacts label="Sessão">
          <DetailFact label="Continua de">
            <span className={styles.linkedTitle}>{first.title}</span>
            <span className={styles.linkedWhen}>{momentLabel(first.createdAt)}</span>
          </DetailFact>
        </DetailFacts>
      ) : failed ? (
        <DetailMessage alert>Pedido anterior não encontrado.</DetailMessage>
      ) : (
        <DetailMessage>Carregando pedido anterior…</DetailMessage>
      )}
    </DetailSection>
  );
}
