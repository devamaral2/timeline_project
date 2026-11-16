"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import type { TaskDto, TaskRequestDto } from "@repo/contracts";
import { DetailSection, detailIcon } from "@/components/detail/detail-parts";
import { momentLabel } from "@/lib/events/event-read-model";
import styles from "./event-relations.module.css";

interface EventRequestsSectionProps {
  userId: string;
  event: TaskDto;
}

const GROUPS = [
  { relation: "generates", id: "created-by", label: "Criado por" },
  { relation: "updates", id: "updated-by", label: "Atualizado por" },
] as const;

/**
 * Os pedidos ao agente que criaram e alteraram o evento: "Criado por" (o pedido
 * que o gerou) e "Atualizado por" (um por pedido que o alterou depois, do mais
 * antigo ao mais novo). O detalhe já traz nome e quando; cada linha leva ao
 * detalhe do pedido. Evento que nenhum pedido tocou não mostra a seção, e com
 * um lado só, só esse lado aparece.
 */
export function EventRequestsSection({ userId, event }: EventRequestsSectionProps) {
  if (event.requests.length === 0) return null;
  return (
    <DetailSection title="Pedidos" labelId="event-requests">
      {GROUPS.map(({ relation, id, label }) => {
        const requests = event.requests.filter((request) => request.relation === relation);
        return requests.length > 0 ? <RequestGroup key={id} id={id} label={label} userId={userId} requests={requests} /> : null;
      })}
    </DetailSection>
  );
}

function RequestGroup({ id, label, userId, requests }: { id: string; label: string; userId: string; requests: TaskRequestDto[] }) {
  const headingId = `request-${id}`;
  return (
    <div className={styles.group}>
      <h3 className={styles.groupLabel} id={headingId}>{label}</h3>
      <ul className={styles.list} aria-labelledby={headingId}>
        {requests.map((request) => (
          <li key={`${request.id}-${request.relation}`} className={styles.requestRow}>
            <span className={styles.requestMark}><Bot {...detailIcon} /></span>
            <Link href={`/${userId}/eventos/${request.id}`} className={styles.requestBody}>
              <span className={styles.requestName}>{request.name}</span>
              <span className={styles.requestMeta}>{momentLabel(request.at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
