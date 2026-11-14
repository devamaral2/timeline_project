"use client";

import type { ArtifactDto, ArtifactEventLinkDto } from "@repo/contracts";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ActionPill, BackLink, DetailActions, DetailFact, DetailFacts, DetailFrame, DetailHeading, DetailMenu, DetailMessage, DetailNav, DetailSection, LinkList, LinkRow, MenuItem, TagPills, detailIcon,
} from "@/components/detail/detail-parts";
import { visualForItemType } from "@/components/events/event-visuals";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { getArtifact } from "@/lib/api/artifacts";
import { ApiRequestError } from "@/lib/api/client-request";
import { artifactTypeLabel } from "@/lib/artifacts/artifact-model";
import { useNow } from "@/lib/events/use-now";
import { whenLabel } from "@/lib/notes/notes-model";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { ArtifactContent } from "./ArtifactContent";
import { DeleteNoteDialog } from "./DeleteNoteDialog";

type LoadState = "loading" | "ready" | "missing" | "error";

/**
 * O artefato aberto, em duas colunas. À esquerda: voltar, o tipo (em mono), o nome na serifa, os fatos
 * (tags e, num artefato global, "Catálogo global") e as ações. À direita: o conteúdo conforme o tipo, os eventos
 * em que o artefato aparece com a relação de cada um, e o Registro (criação e última alteração).
 *
 * Editar e excluir valem só para a nota de texto própria: pílulas na coluna da esquerda (desktop) e o menu
 * "Mais ações" do topo (celular). Alimento, sono, treino e o catálogo global não têm essas ações.
 */
export function NoteDetailScreen({ userId, noteId }: { userId: string; noteId: string }) {
  const now = useNow();
  const router = useMotionRouter();
  const [artifact, setArtifact] = useState<ArtifactDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const listHref = `/${userId}/notas`;
  const editHref = `/${userId}/notas/${noteId}/editar`;

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    getArtifact(noteId).then(
      (loaded) => {
        if (cancelled) return;
        setArtifact(loaded);
        setState("ready");
      },
      (error: unknown) => {
        if (!cancelled) setState(isMissing(error) ? "missing" : "error");
      },
    );
    return () => { cancelled = true; };
  }, [noteId]);

  // Um alimento com o cálculo pendente é relido até o servidor terminar (a falha da leitura não derruba a tela).
  const pendingMeal = artifact?.type === "food" && artifact.data.generation?.status === "pending";
  usePendingMealRefresh(Boolean(pendingMeal), async () => {
    setArtifact(await getArtifact(noteId));
  });

  const frame = { leadLabel: "Resumo da nota", bodyLabel: "Conteúdo da nota" };
  const backOnly = <DetailNav label="Navegação do registro" back={<BackLink href={listHref}>Notas</BackLink>} />;
  if (state === "missing") {
    return <DetailFrame {...frame} lead={backOnly}><DetailMessage alert>Artefato não encontrado.</DetailMessage></DetailFrame>;
  }
  if (state === "error") {
    return <DetailFrame {...frame} lead={backOnly}><DetailMessage alert>Não foi possível carregar o artefato. Tente novamente.</DetailMessage></DetailFrame>;
  }
  if (state !== "ready" || !artifact) {
    return <DetailFrame {...frame} lead={backOnly}><DetailMessage>Carregando artefato…</DetailMessage></DetailFrame>;
  }

  const events = artifact.events ?? [];
  const dates = now ? { created: whenLabel(artifact.createdAt, now), updated: whenLabel(artifact.updatedAt, now) } : null;
  const ownsText = artifact.type === "text" && !artifact.global;

  const actions = ownsText ? (
    <DetailActions>
      <ActionPill icon={<Pencil {...detailIcon} />} onClick={() => router.push(editHref)}>Editar</ActionPill>
      <ActionPill icon={<Trash2 {...detailIcon} />} danger onClick={() => setConfirmingDelete(true)}>Excluir</ActionPill>
    </DetailActions>
  ) : null;

  const menu = ownsText ? (
    <DetailMenu label="Mais ações">
      {(close) => (
        <>
          <MenuItem icon={<Pencil {...detailIcon} />} onClick={() => { close(); router.push(editHref); }}>Editar</MenuItem>
          <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setConfirmingDelete(true); }}>Excluir</MenuItem>
        </>
      )}
    </DetailMenu>
  ) : null;

  /** Uma linha por evento: o ícone do tipo, o nome, a relação (código em mono) e quando o evento começa. */
  function eventRow(link: ArtifactEventLinkDto) {
    const { Icon } = visualForItemType(link.kind);
    const when = now && link.startedAt ? ` · ${whenLabel(link.startedAt, now)}` : "";
    return (
      <LinkRow
        key={link.eventId}
        kind="event"
        icon={<Icon {...detailIcon} />}
        title={link.name}
        sub={`${link.relation}${when}`}
        href={`/${userId}/eventos/${link.eventId}`}
      />
    );
  }

  return (
    <DetailFrame
      {...frame}
      lead={
        <>
          <DetailNav label="Navegação do registro" back={<BackLink href={listHref}>Notas</BackLink>}>{menu}</DetailNav>

          <DetailHeading eyebrow={artifactTypeLabel(artifact.type)}>{artifact.name}</DetailHeading>

          {artifact.tags.length || artifact.global ? (
            <DetailFacts label="Informações">
              {artifact.tags.length ? <DetailFact label="Tags"><TagPills tags={artifact.tags} label="Tags do artefato" /></DetailFact> : null}
              {artifact.global ? <DetailFact label="Origem">Catálogo global</DetailFact> : null}
            </DetailFacts>
          ) : null}

          {actions}
        </>
      }
    >
      <ArtifactContent artifact={artifact} />

      {artifact.global ? null : (
        <DetailSection title="Eventos" labelId="nt-events" count={events.length > 1 ? events.length : undefined}>
          {events.length ? <LinkList>{events.map(eventRow)}</LinkList> : <DetailMessage>Não aparece em nenhum evento.</DetailMessage>}
        </DetailSection>
      )}

      {dates ? (
        <DetailSection title="Registro" labelId="nt-registro">
          <DetailFacts label="Registro">
            <DetailFact label="Criado">{dates.created}</DetailFact>
            <DetailFact label="Última alteração">{dates.updated}</DetailFact>
          </DetailFacts>
        </DetailSection>
      ) : null}

      {confirmingDelete ? (
        <DeleteNoteDialog
          noteId={artifact.id}
          noteName={artifact.name}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => router.replace(listHref)}
        />
      ) : null}
    </DetailFrame>
  );
}

/** O artefato de outro usuário responde 403 e o inexistente 404: a tela diz só que não há artefato. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
