"use client";

import { useSearchParams } from "next/navigation";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { EventEditView } from "./EventEditView";

/**
 * A criação de evento, na rota `/eventos/novo`: o formulário da edição, vazio.
 * `?nome=` põe o título. Salvar e Descartar voltam para a tela de onde a pessoa
 * veio; sem histórico (a rota aberta direto), vão para a agenda.
 */
export function EventCreateRoute({ userId }: { userId: string }) {
  const router = useMotionRouter();
  const initialName = useSearchParams().get("nome") ?? undefined;
  const leave = () => {
    if (window.history.length > 1) router.back();
    else router.replace(`/${userId}`);
  };
  return <EventEditView initialName={initialName} onLeave={leave} />;
}
