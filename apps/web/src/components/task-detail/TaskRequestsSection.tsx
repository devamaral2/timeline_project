"use client";

import { Bot } from "lucide-react";
import Link from "next/link";
import type { TaskDto, TaskRequestDto } from "@repo/contracts";
import { DetailSection, detailIcon } from "@/components/detail/detail-parts";
import { momentLabel } from "@/lib/tasks/task-read-model";
import styles from "./task-relations.module.css";

interface TaskRequestsSectionProps {
  userId: string;
  task: TaskDto;
}

const GROUPS = [
  { relation: "generates", id: "created-by", label: "Criado por" },
  { relation: "updates", id: "updated-by", label: "Atualizado por" },
] as const;

/**
 * Os pedidos ao agente que criaram e alteraram a tarefa: "Criado por" (o pedido
 * que o gerou) e "Atualizado por" (um por pedido que o alterou depois, do mais
 * antigo ao mais novo). O detalhe já traz nome e quando; cada linha leva ao
 * detalhe do pedido. Tarefa que nenhum pedido tocou não mostra a seção, e com
 * um lado só, só esse lado aparece.
 */
export function TaskRequestsSection({ userId, task }: TaskRequestsSectionProps) {
  if (task.requests.length === 0) return null;
  return (
    <DetailSection title="Pedidos" labelId="task-requests">
      {GROUPS.map(({ relation, id, label }) => {
        const requests = task.requests.filter((request) => request.relation === relation);
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
            <Link href={`/${userId}/tarefas/${request.id}`} className={styles.requestBody}>
              <span className={styles.requestName}>{request.name}</span>
              <span className={styles.requestMeta}>{momentLabel(request.at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
