"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { EventDto } from "@repo/contracts";
import { BackButton, DetailFrame, DetailMessage, DetailNav } from "@/components/detail/detail-parts";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { ApiRequestError } from "@/lib/api/client-request";
import { getEvent } from "@/lib/api/events";
import { EventEditView } from "./EventEditView";

type LoadState = "loading" | "ready" | "missing" | "error";

/**
 * O modo de edição do evento de pessoa, na rota `/eventos/:id/editar`. Carrega
 * o evento e monta o formulário; Salvar e Descartar voltam para a leitura, na
 * própria rota de detalhe.
 */
export function EventEditRoute({ userId, eventId }: { userId: string; eventId: string }) {
  const router = useMotionRouter();
  const [event, setEvent] = useState<EventDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
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

  /** Relê depois de uma revisão velha. Se a leitura falhar, fica a versão na tela e o que foi digitado. */
  const reload = useCallback(async () => {
    try {
      setEvent(await getEvent(eventId));
    } catch {
      // Sem a versão nova, a pessoa confere o que digitou e tenta salvar de novo.
    }
  }, [eventId]);

  const detailPath = `/${userId}/eventos/${eventId}`;
  const leave = () => router.replace(detailPath);

  // Salvar volta para a leitura: a tela dela já vem carregada quando a pessoa toca.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `router` é recriado a cada render; só o caminho importa.
  useEffect(() => {
    router.prefetch(detailPath);
  }, [detailPath]);

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
  if (state === "error") return frame(<DetailMessage alert>Não foi possível carregar o evento. Tente novamente.</DetailMessage>);
  if (state === "loading" || !event) return frame(<DetailMessage>Carregando evento…</DetailMessage>);
  if (event.actor === "agent") return frame(<DetailMessage>Este evento é do agente e não se edita aqui.</DetailMessage>);

  return <EventEditView event={event} onReload={reload} onLeave={leave} />;
}

/** O evento de outro usuário responde 403 e o inexistente 404: a tela diz só que não há evento. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
