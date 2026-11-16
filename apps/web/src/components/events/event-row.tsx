import { Bot } from "lucide-react";
import Link from "next/link";
import type { AgentTaskStatus, TaskCardDto, HumanTaskStatus } from "@repo/contracts";
import { cardDurationLabel, cardIsOverdue, cardWhenLabel } from "@/lib/events/card-text";
import { EventKindMark } from "./event-kind-mark";
import { EventStatusGlyph, eventStatusName } from "./event-status-glyph";
import styles from "./event-row.module.css";

export interface EventRowProps {
  /** O cartao de evento do contrato: a linha nao le nenhum campo fora dele. */
  card: TaskCardDto;
  /** Dono da timeline: o toque no resto da linha leva a `/{userId}/eventos/{id}`. */
  userId: string;
  /** O instante atual: os textos calculados (quando, atrasado, "há 12 min") saem dele. */
  now: Date;
  /** A lista pede a regra da serie no lugar do horario, quando a ocorrencia tem uma. */
  ruleInPlaceOfTime?: boolean;
  /** Toque no glifo de um evento de pessoa (a tela abre a escolha de status). */
  onStatusClick?: (card: TaskCardDto, anchor: HTMLElement) => void;
}

/**
 * A linha única das listas: glifo de status, título, uma linha com o tipo, o
 * "quando" e as tags, e a duração à direita. Pessoa e agente usam a
 * mesma grade; o evento de agente fecha a linha com o robô, a sua assinatura.
 * O glifo de pessoa é um botão; o de agente não muda status.
 */
export function EventRow({ card, userId, now, ruleInPlaceOfTime, onStatusClick }: EventRowProps) {
  const isAgent = card.actor === "agent";
  const overdue = !isAgent && cardIsOverdue(card, now);
  const when = cardWhenLabel(card, now, { ruleInPlaceOfTime });
  const duration = cardDurationLabel(card);
  // O contrato garante que o status e de agente quando o ator e agente, e de pessoa (ou ausente) no outro caso.
  const agentStatus = card.status as AgentTaskStatus;
  const humanStatus = (card.status ?? null) as HumanTaskStatus | null;
  const glyph = isAgent ? (
    <EventStatusGlyph actor="agent" status={agentStatus} />
  ) : (
    <EventStatusGlyph actor="human" status={humanStatus} />
  );

  return (
    <li className={styles.row} data-actor={card.actor} data-status={card.status ?? "reference"}>
      {isAgent ? (
        <span className={styles.glyphSlot}>{glyph}</span>
      ) : (
        <button
          type="button"
          className={styles.glyphButton}
          aria-label={`${eventStatusName("human", humanStatus)}. Mudar status de “${card.name}”`}
          onClick={(event) => onStatusClick?.(card, event.currentTarget)}
        >
          {glyph}
        </button>
      )}
      <Link href={`/${userId}/eventos/${card.id}`} className={styles.body}>
        <span className={styles.text}>
          <span className={styles.title}>{card.name}</span>
          <span className={styles.meta}>
            <EventKindMark kind={card.kind} />
            <span className={styles.when} data-overdue={overdue ? "true" : "false"}>
              {when}
            </span>
            {card.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                #{tag}
              </span>
            ))}
          </span>
        </span>
        {duration ? <span className={styles.duration}>{duration}</span> : null}
        {/* Decorativo: o nome do glifo de status já diz "Agente". */}
        {isAgent ? <Bot className={styles.agentMark} size={18} strokeWidth={1.9} aria-hidden="true" data-agent-mark /> : null}
      </Link>
    </li>
  );
}
