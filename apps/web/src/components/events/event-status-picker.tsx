"use client";

import type { EventCardDto, HumanEventStatus } from "@repo/contracts";
import { useLayoutEffect, useRef } from "react";
import { useDismiss } from "@/components/detail/detail-parts";
import { EventChoiceList } from "@/components/event-detail/EventChoice";
import detail from "@/components/event-detail/event-detail.module.css";
import { humanStatusOptions } from "@/lib/events/event-read-model";
import { EventStatusGlyph, eventStatusName } from "./event-status-glyph";
import styles from "./event-glyphs.module.css";

/** Distância entre o glifo e o cartão, e a folga mínima das bordas da tela. */
const GAP = 6;
const EDGE = 16;

/**
 * A escolha dos sete status de pessoa, aberta pelo glifo de uma linha: o ponto
 * azul de um evento de referência na agenda e o glifo de qualquer tarefa na
 * lista de tarefas. A lista é a mesma do topo do detalhe; aqui ela abre logo
 * abaixo do glifo tocado, alinhada à esquerda dele (acima, quando não cabe
 * embaixo), com o status atual marcado, e fecha com Esc ou toque fora. Sem
 * glifo de âncora, fica no cartão do pé da tela que o CSS define.
 */
export function EventStatusPicker({ card, anchor, onPick, onClose }: {
  card: EventCardDto;
  anchor?: HTMLElement | null;
  onPick: (status: HumanEventStatus) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(true, ref, onClose);
  useLayoutEffect(() => {
    const picker = ref.current;
    if (!picker || !anchor) return;
    function place() {
      if (!picker || !anchor) return;
      // Sem estilo próprio o cartão volta ao pé da tela: a base dele ali é o limite que a barra inferior deixa.
      picker.removeAttribute("style");
      const foot = picker.getBoundingClientRect();
      const glyph = anchor.getBoundingClientRect();
      const below = glyph.bottom + GAP;
      const top = below + foot.height <= foot.bottom ? below : Math.max(EDGE, Math.min(glyph.top - GAP, foot.bottom) - foot.height);
      const left = Math.max(EDGE, Math.min(glyph.left, window.innerWidth - foot.width - EDGE));
      picker.style.inset = `${top}px auto auto ${left}px`;
      picker.style.margin = "0";
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  // O contrato garante status de pessoa (ou nenhum) quando o ator é pessoa; o glifo de agente não abre a escolha.
  const current = card.actor === "human" ? ((card.status ?? null) as HumanEventStatus | null) : null;
  return (
    <div ref={ref} role="dialog" aria-label={`Status de “${card.name}”`} className={styles.statusPicker}>
      <EventChoiceList<HumanEventStatus>
        listLabel="Status do evento"
        value={current}
        className={detail.choiceList}
        options={humanStatusOptions(card).map((value) => ({
          value,
          label: eventStatusName("human", value),
          icon: <EventStatusGlyph actor="human" status={value} size={18} />,
        }))}
        onPick={onPick}
      />
    </div>
  );
}
