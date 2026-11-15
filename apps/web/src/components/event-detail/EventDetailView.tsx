"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { EventDto, EventPriority, HumanEventStatus } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { BackLink, DetailFrame, DetailMenu, DetailMessage, MenuItem, detailIcon } from "@/components/detail/detail-parts";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
import { visualForItemType } from "@/components/events/event-visuals";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { ApiRequestError } from "@/lib/api/client-request";
import { type EditEventInput, updateEvent } from "@/lib/api/events";
import { momentLabel, priorityPatch, statusPatch } from "@/lib/events/event-read-model";
import { EventBlocksSection } from "./EventBlocksSection";
import { EventDetailHeader } from "./EventDetailHeader";
import { EventInfoSection } from "./EventInfoSection";
import { EventSubtasksSection } from "./EventSubtasksSection";
import styles from "./event-detail.module.css";

interface EventDetailViewProps {
  userId: string;
  event: EventDto;
  /** Relê o evento depois de uma troca. Não lança: a falha fica com a tela que o carregou. */
  onChanged: () => Promise<void>;
}

const STALE_MESSAGE = "Este evento mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.";

/**
 * O detalhe de evento em modo de leitura, a rota única para agenda e lista de
 * tarefas. A tela é uma coluna de seções separadas: o topo (este arquivo e
 * `EventDetailHeader`), as Informações (`EventInfoSection`), e as seções de
 * relação: Subtarefas (`EventSubtasksSection`) e Bloqueios (`EventBlocksSection`).
 * O próximo ticket acrescenta a seção de artefatos no corpo, depois dessas (22).
 * "Excluir" fica no menu "Mais ações" do topo, ao lado de "Editar" (23).
 */
export function EventDetailView({ userId, event, onChanged }: EventDetailViewProps) {
  const router = useMotionRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editHref = `/${userId}/eventos/${event.id}/editar`;
  const visual = visualForItemType(event.kind);
  const TypeIcon = visual.Icon;

  /** Manda a troca com a revisão lida. Revisão velha: relê o evento e avisa, sem gravar nada. */
  async function change(patch: EditEventInput, failure: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateEvent(event.id, patch);
      window.dispatchEvent(new Event(agendaRefreshEvent));
      await onChanged();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        await onChanged();
        setError(STALE_MESSAGE);
      } else {
        setError(failure);
      }
    } finally {
      setSaving(false);
    }
  }

  const changeStatus = (status: HumanEventStatus) =>
    change(statusPatch(event, status, new Date()), "Não foi possível trocar o status. Tente novamente.");
  const changePriority = (priority: EventPriority) =>
    change(priorityPatch(event, priority), "Não foi possível trocar a prioridade. Tente novamente.");

  const lead = (
    <>
      <nav className={styles.topbar} aria-label="Navegação do registro">
        <BackLink href={`/${userId}`}>Agenda</BackLink>
        <span className={styles.topbarTitle}>Evento</span>
        <div className={styles.topbarActions}>
          <Link href={editHref} className={styles.editLink} aria-label="Editar evento">
            <Pencil {...detailIcon} />
          </Link>
          <DetailMenu label="Mais ações">
            {(close) => (
              <>
                <MenuItem icon={<Pencil {...detailIcon} />} onClick={() => { close(); router.push(editHref); }}>Editar</MenuItem>
                <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setConfirmingDelete(true); }}>Excluir</MenuItem>
              </>
            )}
          </DetailMenu>
        </div>
      </nav>
      <EventDetailHeader event={event} busy={saving} onStatusChange={changeStatus} onPriorityChange={changePriority} />
    </>
  );

  return (
    <DetailFrame type={event.kind} leadLabel="Resumo do evento" bodyLabel="Conteúdo do evento" lead={lead}>
      <EventInfoSection event={event} />
      <EventSubtasksSection userId={userId} event={event} />
      <EventBlocksSection userId={userId} event={event} />
      {/* Ticket 22: artefatos do evento. */}
      {error ? <DetailMessage alert>{error}</DetailMessage> : null}
      <EntityAiEditBar
        userId={userId}
        entityType="event"
        entityId={event.id}
        onEdited={() => {
          window.dispatchEvent(new Event(agendaRefreshEvent));
          void onChanged();
        }}
        context={{
          icon: <TypeIcon aria-hidden />,
          meta: event.startedAt ? `Evento · ${momentLabel(event.startedAt)}` : "Evento",
          title: event.name,
        }}
      />
      {confirmingDelete ? (
        <DeleteEventDialog
          eventId={event.id}
          eventName={event.name}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => {
            window.dispatchEvent(new Event(agendaRefreshEvent));
            router.back();
          }}
        />
      ) : null}
    </DetailFrame>
  );
}
