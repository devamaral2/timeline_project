"use client";

import type { TaskDto } from "@repo/contracts";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { BackButton, DetailFrame, DetailMessage, DetailNav } from "@/components/detail/detail-parts";
import { AgentEventDetailView } from "@/components/event-detail/AgentEventDetailView";
import { EventDetailView } from "@/components/event-detail/EventDetailView";
import { ApiRequestError } from "@/lib/api/client-request";
import { getEvent } from "@/lib/api/events";

type LoadState = "loading" | "ready" | "missing" | "error";

/** A única rota de detalhe de evento: a agenda e a lista de tarefas abrem aqui. */
export default function EventPage({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const router = useMotionRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [event, setEvent] = useState<TaskDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    void params.then(({ userId: nextUserId, eventId: nextEventId }) => {
      if (!cancelled) {
        setUserId(nextUserId);
        setEventId(nextEventId);
      }
    });
    return () => { cancelled = true; };
  }, [params]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setState("loading");
    getEvent(eventId).then(
      (loaded) => {
        if (cancelled) return;
        setEvent(loaded);
        setState("ready");
      },
      (error: unknown) => {
        if (!cancelled) setState(isMissing(error) ? "missing" : "error");
      },
    );
    return () => { cancelled = true; };
  }, [eventId]);

  /** Relê o evento depois de uma troca. Falha de leitura vira a tela de erro. */
  const reload = useCallback(async () => {
    if (!eventId) return;
    try {
      setEvent(await getEvent(eventId));
    } catch (error) {
      setState(isMissing(error) ? "missing" : "error");
    }
  }, [eventId]);

  function frame(children: ReactNode) {
    return (
      <DetailFrame
        leadLabel="Resumo do evento"
        bodyLabel="Conteúdo do evento"
        lead={<DetailNav label="Navegação do registro" back={<BackButton onClick={() => router.back()}>Voltar</BackButton>} />}
      >
        {children}
      </DetailFrame>
    );
  }

  if (state === "missing") return frame(<DetailMessage alert>Evento não encontrado.</DetailMessage>);
  if (state === "error" || (state === "ready" && !event)) {
    return frame(<DetailMessage alert>Não foi possível carregar o evento. Tente novamente.</DetailMessage>);
  }
  if (state === "loading" || !event || !userId) return frame(<DetailMessage>Carregando evento…</DetailMessage>);

  if (event.actor === "agent") return <AgentEventDetailView userId={userId} event={event} onChanged={reload} />;
  return <EventDetailView userId={userId} event={event} onChanged={reload} />;
}

/** O evento de outro usuário responde 403 e o inexistente 404: a tela diz só que não há evento. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
