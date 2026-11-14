"use client";

import type { ArtifactDto, ArtifactEventLinkDto } from "@repo/contracts";
import { useEffect, useState } from "react";
import {
  BackLink, DetailFact, DetailFacts, DetailFrame, DetailHeading, DetailMessage, DetailNav, DetailSection, LinkList, LinkRow, TagPills, detailIcon,
} from "@/components/detail/detail-parts";
import { visualForItemType } from "@/components/events/event-visuals";
import { getArtifact } from "@/lib/api/artifacts";
import { ApiRequestError } from "@/lib/api/client-request";
import { artifactTypeLabel } from "@/lib/artifacts/artifact-model";
import { useNow } from "@/lib/events/use-now";
import { whenLabel } from "@/lib/notes/notes-model";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { ArtifactContent } from "./ArtifactContent";

type LoadState = "loading" | "ready" | "missing" | "error";

/**
 * O artefato aberto, em duas colunas. À esquerda: voltar, o tipo (em mono), o nome na serifa e os fatos
 * (tags e, num artefato global, "Catálogo global"). À direita: o conteúdo conforme o tipo, os eventos em que o
 * artefato aparece com a relação de cada um, e o Registro (criação e última alteração).
 *
 * Ainda sem ações: editar, apagar e pedir ao agente entram nos tickets 35 a 39 e 43, só para o artefato próprio.
 */
export function NoteDetailScreen({ userId, noteId }: { userId: string; noteId: string }) {
  const now = useNow();
  const [artifact, setArtifact] = useState<ArtifactDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const listHref = `/${userId}/notas`;

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
          <DetailNav label="Navegação do registro" back={<BackLink href={listHref}>Notas</BackLink>} />

          <DetailHeading eyebrow={artifactTypeLabel(artifact.type)}>{artifact.name}</DetailHeading>

          {artifact.tags.length || artifact.global ? (
            <DetailFacts label="Informações">
              {artifact.tags.length ? <DetailFact label="Tags"><TagPills tags={artifact.tags} label="Tags do artefato" /></DetailFact> : null}
              {artifact.global ? <DetailFact label="Origem">Catálogo global</DetailFact> : null}
            </DetailFacts>
          ) : null}
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
    </DetailFrame>
  );
}

/** O artefato de outro usuário responde 403 e o inexistente 404: a tela diz só que não há artefato. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
