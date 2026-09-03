"use client";

import { useState } from "react";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import {
  durationRatioOf,
  elapsedSecondsOf,
  formatStopwatch,
  formatTime,
  MIN_DURATION_RATIO,
} from "@repo/timeline";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/events/use-now";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EditEventModal } from "./EditEventModal";
import { EventDetailsModal } from "./EventDetailsModal";
import { MissedBadge } from "./MissedBadge";
import { ICON_STROKE_WIDTH, visualForItemType, type ItemTypeVisual } from "./event-visuals";

interface EventCardProps {
  event: TimelineEventCardDto;
  /**
   * Duracao do evento mais longo do mesmo dia, em minutos: a escala da barra
   * do rodape. Comparar contra o dia e o que faz a barra dizer alguma coisa —
   * os cartoes que estao juntos na coluna sao os do mesmo dia.
   */
  longestMinutes: number;
}

export function EventCard({ event, longestMinutes }: EventCardProps) {
  const [viewingDetails, setViewingDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const visual = visualForItemType(event.primaryItemType);
  const isRunning = !event.finishedAt;

  // Sem `overflow-hidden` no wrapper: o halo e o levantar do cartao no hover
  // precisam escapar da caixa. Quem corta e o proprio <article>.
  return (
    <div className="relative">
      <CardContent
        event={event}
        visual={visual}
        isRunning={isRunning}
        longestMinutes={longestMinutes}
        onOpenDetails={() => setViewingDetails(true)}
      />

      {viewingDetails ? (
        <EventDetailsModal
          eventId={event.id}
          eventName={event.name}
          onClose={() => setViewingDetails(false)}
          onEdit={() => {
            setViewingDetails(false);
            setEditing(true);
          }}
          onDelete={() => {
            setViewingDetails(false);
            setDeleting(true);
          }}
        />
      ) : null}

      {editing ? (
        <EditEventModal
          eventId={event.id}
          onClose={() => setEditing(false)}
          onUpdated={() => window.location.reload()}
        />
      ) : null}

      {deleting ? (
        <DeleteEventDialog
          eventId={event.id}
          eventName={event.name}
          onClose={() => setDeleting(false)}
          onDeleted={() => window.location.reload()}
        />
      ) : null}
    </div>
  );
}

interface CardContentProps {
  event: TimelineEventCardDto;
  visual: ItemTypeVisual;
  isRunning: boolean;
  longestMinutes: number;
  onOpenDetails: () => void;
}

function CardContent({
  event,
  visual: { Icon, label, text, bar },
  isRunning,
  longestMinutes,
  onOpenDetails,
}: CardContentProps) {
  const now = useNow();
  // Null ate a hidratacao, e null tambem em tudo que ja terminou.
  const elapsedSeconds = isRunning && now ? elapsedSecondsOf(event.startedAt, now) : null;

  // A barra do evento em andamento cresce com o cronometro, na mesma escala do
  // dia — quando ele passa do mais longo do dia, ela para de crescer na borda.
  const ratio =
    elapsedSeconds !== null
      ? longestMinutes > 0
        ? Math.min(1, Math.max(MIN_DURATION_RATIO, elapsedSeconds / 60 / longestMinutes))
        : MIN_DURATION_RATIO
      : (durationRatioOf(event, longestMinutes) ?? MIN_DURATION_RATIO);

  return (
    <article
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border bg-card px-4 pb-3.5 pt-4 shadow-card transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card-hover",
        // Um evento em andamento se destaca pela borda na cor da marca.
        isRunning ? "border-brand/45" : "border-border",
      )}
    >
      {/*
        O icone entra direto sobre a superficie do cartao — sem quadradinho de
        fundo e sem aro —, como no board da identidade. Quem diz o tipo sao a
        cor e o rotulo em cima do nome.
      */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Icon
          aria-hidden
          strokeWidth={ICON_STROKE_WIDTH}
          className={cn("size-6 shrink-0", text)}
        />

        <div className="min-w-0">
          {/* Tipo e status dividem a linha de cima: um diz o que o evento e, o
              outro em que pe ele esta. */}
          <div className="flex min-w-0 items-center gap-1.5">
            <p className={cn("truncate text-[11px] font-medium leading-4", text)}>{label}</p>
            <MissedBadge missed={event.missed} />
          </div>
          <h3 className="text-[14.5px] font-semibold leading-5 text-card-foreground">
            <button
              type="button"
              onClick={onOpenDetails}
              className="block w-full truncate rounded text-left transition-colors hover:text-brand-accent focus-visible:text-brand-accent focus-visible:outline-none"
            >
              {event.name}
            </button>
          </h3>
        </div>

        <div className="flex flex-col items-end gap-1">
          <p className="flex items-center justify-end gap-2 text-[11.5px] font-medium leading-4 text-muted-foreground">
            {isRunning ? (
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/70" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
            ) : null}
            <span className="tabular-nums">
              {formatTime(event.startedAt)} <span aria-hidden>→</span>
              <span className="sr-only">até</span>{" "}
              {event.finishedAt ? formatTime(event.finishedAt) : "em andamento"}
            </span>
          </p>
          {/*
            O contador. Enquanto a tarefa corre, o lugar do `durationLabel` — que
            a API manda como "--" justamente porque ainda nao ha duracao — recebe
            o tempo subindo, na cor da marca. Quando ela termina, o mesmo lugar
            volta a mostrar o registro que veio do backend.
          */}
          {elapsedSeconds === null ? (
            <p className="text-[10.5px] font-semibold tabular-nums text-muted-foreground/80">
              {event.durationLabel}
            </p>
          ) : (
            <p
              aria-label={`Em andamento ha ${formatStopwatch(elapsedSeconds)}`}
              className="text-[12.5px] font-bold tracking-[0.01em] tabular-nums text-brand"
            >
              {formatStopwatch(elapsedSeconds)}
            </p>
          )}
        </div>
      </div>

      {event.tags.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {event.tags.map((tag) => (
            <li
              key={tag}
              style={tagColorStyle(tag)}
              className="rounded-full px-2 py-0.5 text-[11.5px] font-medium"
            >
              #{tag}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        A barra de duracao. Ela mede o tempo gasto sem mexer na altura do
        cartao: dois eventos de tamanhos muito diferentes continuam ocupando a
        mesma area da coluna, e a comparacao acontece na largura da linha.
      */}
      <div aria-hidden className="mt-3.5 flex">
        <span
          className={cn(
            "h-[3px] rounded-full transition-[width] duration-500",
            elapsedSeconds === null ? bar : "bg-brand",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </article>
  );
}
