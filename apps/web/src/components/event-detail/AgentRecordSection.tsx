"use client";

import type { RequestDto } from "@repo/contracts";
import { DetailFact, DetailFacts, DetailSection } from "@/components/detail/detail-parts";
import { momentLabel } from "@/lib/events/event-read-model";

/** A seção "Registro" do pedido: quando foi criado e a última alteração. */
export function AgentRecordSection({ request }: { request: RequestDto }) {
  return (
    <DetailSection title="Registro" labelId="agent-record">
      <DetailFacts label="Registro">
        <DetailFact label="Criado em">{momentLabel(request.createdAt)}</DetailFact>
        <DetailFact label="Última alteração">{momentLabel(request.updatedAt)}</DetailFact>
      </DetailFacts>
    </DetailSection>
  );
}
