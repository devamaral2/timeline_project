"use client";

import type { EventCardDto, HumanEventStatus } from "@repo/contracts";
import { useRef } from "react";
import { useDismiss } from "@/components/detail/detail-parts";
import { EventStatusGlyph, eventStatusName } from "@/components/events/event-status-glyph";
import { EventChoiceList } from "@/components/event-detail/EventChoice";
import detail from "@/components/event-detail/event-detail.module.css";
import { humanStatusOptions } from "@/lib/events/event-read-model";
import styles from "./agenda.module.css";

/**
 * A escolha dos sete status de pessoa para um evento de referência, aberta
 * pelo ponto azul da agenda. A lista é a mesma do topo do detalhe; aqui ela
 * fica num cartão flutuante, e fecha com Esc ou toque fora.
 */
export function AgendaStatusPicker({ card, onPick, onClose }: {
  card: EventCardDto;
  onPick: (status: HumanEventStatus) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(true, ref, onClose);
  return (
    <div ref={ref} role="dialog" aria-label={`Status de “${card.name}”`} className={styles.statusPicker}>
      <EventChoiceList<HumanEventStatus>
        listLabel="Status do evento"
        value={null}
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
