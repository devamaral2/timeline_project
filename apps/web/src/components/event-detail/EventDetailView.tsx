"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { TaskDto, TaskPriority, HumanTaskStatus } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { BackLink, DetailFrame, DetailMenu, DetailMessage, MenuItem, detailIcon } from "@/components/detail/detail-parts";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
import { visualForItemType } from "@/components/events/event-visuals";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { ApiRequestError } from "@/lib/api/client-request";
import { type EditEventInput, updateEvent } from "@/lib/api/events";
import { momentLabel, priorityPatch, statusPatch } from "@/lib/events/event-read-model";
import { EventArtifactsSection } from "./EventArtifactsSection";
import { EventDetailHeader } from "./EventDetailHeader";
import { EventInfoSection } from "./EventInfoSection";
import { EventRequestsSection } from "./EventRequestsSection";
import { EventSequenceSection } from "./EventSequenceSection";
import styles from "./event-detail.module.css";

interface EventDetailViewProps {
  userId: string;
  event: TaskDto;
  /** Relê o evento depois de uma troca. Não lança: a falha fica com a tela que o carregou. */
  onChanged: () => Promise<void>;
}

const STALE_MESSAGE = "Este evento mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.";

/**
 * O detalhe de evento em modo de leitura, a rota única para agenda e lista de
 * tarefas. A tela é uma coluna de seções separadas: o topo (este arquivo e
 * `EventDetailHeader`), as Informações (`EventInfoSection`), e as seções de
 * relação: Sequência (`EventSequenceSection`) Artefatos (`EventArtifactsSection`) e Pedidos (`EventRequestsSection`: criado e atualizado por). "Excluir" fica no menu "Mais ações" do
 * topo, ao lado de "Editar" (ticket 23).
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

  const changeStatus = (status: HumanTaskStatus) =>
    change(statusPatch(event, status, new Date()), "Não foi possível trocar o status. Tente novamente.");
  const changePriority = (priority: TaskPriority) =>
    change(priorityPatch(event, priority), "Não foi possível trocar a prioridade. Tente novamente.");

  const lead = (
    <>
      <nav className={styles.topbar} aria-label="Navegação do registro">
        <BackLink href={`/${userId}`} label="Voltar para a Agenda" />
        <span className={styles.topbarTitle}>Evento</span>
        <div className={styles.topbarActions}>
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
      <EventSequenceSection userId={userId} event={event} />
      <EventArtifactsSection userId={userId} event={event} />
      <EventRequestsSection userId={userId} event={event} />
      {error ? <DetailMessage alert>{error}</DetailMessage> : null}
      <EntityAiEditBar
        userId={userId}
        entityType="task"
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
