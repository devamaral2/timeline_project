"use client";

import {
  ArrowLeft, Bell, Check, Circle, CircleCheck, CircleDashed, CircleSlash,
  Clock3, Flag, MoreVertical, Pencil, Trash2, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  compactDate, dayKeyOf, elapsedSecondsOf, eventPositionOf, formatStopwatch,
  formatTime, longDate, type EventPosition,
} from "@repo/timeline";
import type { EventDetailDto, EventItemDto, MealItem, TaskDetailDto, WorkItemStatus } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import {
  ICON_STROKE_WIDTH, missedLabel, notificationOffsetLabel,
  priorityLabels, visualForItemType,
} from "./event-visuals";
import styles from "./event-detail-screen.module.css";

/**
 * O que a tela faz alem de mostrar. Ausente, o menu aparece desligado — e o
 * que o estudo visual precisa, e evita um menu que promete acao e nao cumpre.
 */
export interface EventDetailActions {
  onEdit: () => void;
  onToggleMissed: () => void;
  onDelete: () => void;
  savingMissed: boolean;
}

export interface EventDetailScreenProps {
  event: EventDetailDto;
  /** As tarefas vinculadas, ja resolvidas por quem carregou o evento. */
  tasks?: TaskDetailDto[];
  backHref: string;
  actions?: EventDetailActions;
  /** Mensagem de erro de uma acao — some quando a acao da certo. */
  actionError?: string | null;
}

/**
 * A tela de detalhe do evento.
 *
 * A composicao e a mesma para todo tipo: navegacao, tipo, nome com a data ao
 * lado, o cartao de resumo — horario, duracao, metadados, tags e a situacao no
 * tempo — e as secoes de texto (descricao, tarefas, notas). O que o tipo do
 * evento traz de proprio entra como mais uma secao entre a descricao e as
 * tarefas; o esqueleto nao muda.
 */
export function EventDetailScreen({ event, tasks = [], backHref, actions, actionError }: EventDetailScreenProps) {
  const primary = event.items.find((item) => item.id === event.primaryItemId);
  const visual = visualForItemType(primary?.type ?? "");
  const TypeIcon = visual.Icon;
  const dayKey = dayKeyOf(event.startedAt);

  return (
    <div className={styles.screen}>
      <nav className={styles.topBar} aria-label="Navegação do evento">
        <Link href={backHref} className={styles.iconAction} aria-label="Voltar para a agenda">
          <ArrowLeft aria-hidden />
        </Link>
        <EventMenu missed={event.missed} actions={actions} />
      </nav>

      <header data-type={primary?.type ?? "routine"}>
        <p className={styles.type}>
          <TypeIcon aria-hidden strokeWidth={ICON_STROKE_WIDTH} />
          {visual.label}
        </p>
        <div className={styles.titleRow}>
          <h1>{event.name}</h1>
          <time className={styles.headingDate} dateTime={dayKey} title={longDate(dayKey)}>
            {compactDate(dayKey)}
          </time>
        </div>
      </header>

      <EventSummary event={event} dayKey={dayKey} />

      <Section title="Descrição">
        {event.description
          ? <p className={styles.prose}>{event.description}</p>
          : <p className={styles.empty}>Sem descrição.</p>}
      </Section>

      {event.items.map((item) => <ItemSection key={item.id} item={item} />)}

      {event.interruptions.length ? (
        <Section title="Interrupções">
          <ul className={styles.list}>
            {event.interruptions.map((interruption) => (
              <li key={interruption.id}>
                <div>
                  <p>{interruption.name}</p>
                  {interruption.description ? <p className={styles.secondary}>{interruption.description}</p> : null}
                </div>
                <span>{durationLabel(interruption.startedAt, interruption.finishedAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Tarefas">
        {tasks.length ? (
          <ul className={styles.tasks}>
            {tasks.map((task) => {
              const { Icon, label } = taskStatusVisuals[task.status] ?? taskStatusVisuals.todo;
              return (
                <li key={task.id} data-done={task.status === "done"}>
                  <Icon role="img" aria-label={label} />
                  <span>{task.name}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>Nenhuma tarefa vinculada.</p>
        )}
      </Section>

      <Section title="Notas">
        <p className={styles.empty}>Nenhuma nota ainda.</p>
      </Section>

      {actionError ? <p role="alert" className={`${styles.message} ${styles.error}`}>{actionError}</p> : null}
    </div>
  );
}

/**
 * O cartao de resumo. Le-se de cima para baixo: quando, o que mais se sabe do
 * evento, como ele esta marcado e em que ponto do tempo ele esta.
 */
function EventSummary({ event, dayKey }: { event: EventDetailDto; dayKey: string }) {
  const now = useNow();
  // Sem relogio nao ha situacao no tempo: o HTML do servidor nasce num instante
  // e hidrata em outro, e os dois discordariam de um evento que acabou de virar.
  const position = now ? eventPositionOf(event, now) : null;
  const running = position === "running";
  const endDayKey = event.finishedAt ? dayKeyOf(event.finishedAt) : null;
  const metadata = metadataOf(event);

  return (
    <section className={styles.summary} aria-label="Resumo do evento">
      <div className={styles.schedule}>
        <p className={styles.range}>
          <time dateTime={event.startedAt}>{formatTime(event.startedAt)}</time>
          <span className={styles.separator} aria-hidden>–</span>
          {event.finishedAt ? (
            <time dateTime={event.finishedAt}>
              {formatTime(event.finishedAt)}
              {endDayKey && endDayKey !== dayKey ? (
                <span className={styles.endsOnAnotherDay}>{longDate(endDayKey)}</span>
              ) : null}
            </time>
          ) : (
            <span className={styles.openEnd}>{running ? "em andamento" : "sem hora de fim"}</span>
          )}
        </p>
        <DurationReadout event={event} now={now} running={running} />
      </div>

      {metadata.length ? (
        <ul className={styles.metadata}>
          {metadata.map(({ Icon, text }) => (
            <li key={text}><Icon aria-hidden />{text}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.summaryFoot}>
        <ul className={styles.tags} aria-label="Tags do evento">
          {event.missed ? <li className={styles.missed}>{missedLabel}</li> : null}
          {event.tags.map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
        <PositionBadge position={position} />
      </div>
    </section>
  );
}

/**
 * O numero a direita do horario: a duracao de um evento encerrado ou o
 * cronometro de um que ainda corre. Sao formatos diferentes de proposito —
 * "1h 30min" e registro, "1:30:07" e um numero subindo.
 */
function DurationReadout({ event, now, running }: { event: EventDetailDto; now: Date | null; running: boolean }) {
  if (running && now) {
    return (
      <p className={`${styles.duration} ${styles.live}`} title="Tempo decorrido">
        {formatStopwatch(elapsedSecondsOf(event.startedAt, now))}
      </p>
    );
  }
  if (!event.finishedAt) return null;
  return <p className={styles.duration}>{durationLabel(event.startedAt, event.finishedAt)}</p>;
}

const positionLabels: Record<EventPosition, string> = {
  past: "Já aconteceu",
  running: "Acontecendo agora",
  upcoming: "Ainda vai acontecer",
};

/**
 * A situacao do evento no tempo, num quadro so. Antes da hidratacao ele fica
 * vazio — um estado errado por um quadro le como informacao, nao como espera.
 */
function PositionBadge({ position }: { position: EventPosition | null }) {
  if (!position) return <span className={styles.position} aria-hidden />;
  return (
    <span className={styles.position} data-position={position} role="img" aria-label={positionLabels[position]} title={positionLabels[position]}>
      {position === "past" ? <Check aria-hidden /> : <i />}
    </span>
  );
}

/** O menu do evento: editar, anotar o que nao aconteceu, excluir. */
function EventMenu({ missed, actions }: { missed: boolean; actions?: EventDetailActions }) {
  if (!actions) {
    return (
      <button type="button" disabled className={styles.iconAction} aria-label="Mais opções do evento">
        <MoreVertical aria-hidden />
      </button>
    );
  }

  function run(target: HTMLElement, action: () => void) {
    const menu = target.closest("details");
    if (menu) menu.open = false;
    action();
  }

  return (
    <details
      className={styles.menu}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key !== "Escape") return;
        keyboardEvent.currentTarget.open = false;
        keyboardEvent.currentTarget.querySelector("summary")?.focus();
      }}
      onBlur={(focusEvent) => {
        if (!focusEvent.currentTarget.contains(focusEvent.relatedTarget)) focusEvent.currentTarget.open = false;
      }}
    >
      <summary className={styles.iconAction} aria-label="Mais opções do evento" title="Mais opções do evento">
        <MoreVertical aria-hidden />
      </summary>
      <div className={styles.menuPanel}>
        <button type="button" onClick={(click) => run(click.currentTarget, actions.onEdit)}>
          <Pencil aria-hidden />Editar evento
        </button>
        <button type="button" disabled={actions.savingMissed} onClick={(click) => run(click.currentTarget, actions.onToggleMissed)}>
          <CircleSlash aria-hidden />
          {missed ? `Desmarcar "${missedLabel}"` : `Marcar como ${missedLabel.toLowerCase()}`}
        </button>
        <button type="button" className={styles.danger} onClick={(click) => run(click.currentTarget, actions.onDelete)}>
          <Trash2 aria-hidden />Excluir evento
        </button>
      </div>
    </details>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2>{children}</section>;
}

const taskStatusVisuals: Record<WorkItemStatus, { Icon: LucideIcon; label: string }> = {
  inHold: { Icon: CircleDashed, label: "Em espera" },
  todo: { Icon: Circle, label: "A fazer" },
  inProgress: { Icon: Clock3, label: "Em andamento" },
  done: { Icon: CircleCheck, label: "Concluída" },
  cancel: { Icon: CircleSlash, label: "Cancelada" },
};

/**
 * Os metadados que o evento carrega hoje. A prioridade normal nao aparece:
 * dizer "Normal" gasta uma linha para nao informar nada.
 */
function metadataOf(event: EventDetailDto): Array<{ Icon: LucideIcon; text: string }> {
  const rows: Array<{ Icon: LucideIcon; text: string }> = [];
  if (event.priority !== "normal") rows.push({ Icon: Flag, text: priorityLabels[event.priority] });
  if (event.notifyOffsetsMinutes.length) {
    rows.push({ Icon: Bell, text: event.notifyOffsetsMinutes.map(notificationOffsetLabel).join(" · ") });
  }
  return rows;
}

function ItemSection({ item }: { item: EventItemDto }) {
  if (item.type === "meal") return (
    <Section title="Refeição">
      <p className={styles.prose}>{item.data.name}</p>
      {item.data.description ? <p className={styles.secondary}>{item.data.description}</p> : null}
      <Nutrition data={item.data} />
    </Section>
  );

  if (item.type === "training" && item.data.workouts.length) return (
    <Section title="Treinos">
      <ul className={styles.list}>
        {item.data.workouts.map((workout) => (
          <li key={workout.id}>
            <p>{workout.workoutName}</p>
            <span>{workout.duration} min · {workout.calories} kcal</span>
          </li>
        ))}
      </ul>
    </Section>
  );

  if (item.type === "sleep") return (
    <Section title="Sono">
      <p className={styles.prose}>
        {item.data.trackedSleepTime} min monitorados
        <span className={styles.secondary}> · pontuação {item.data.score}</span>
      </p>
    </Section>
  );

  return null;
}

function Nutrition({ data }: { data: MealItem }) {
  const values = [
    ["Calorias", data.totals.totalCaloriesKcal, "kcal"],
    ["Proteína", data.totals.totalProteinGrams, "g"],
    ["Carboidratos", data.totals.totalCarbohydrateGrams, "g"],
    ["Gorduras", data.totals.totalFatGrams, "g"],
  ] as const;

  return (
    <dl className={styles.nutrition} aria-label="Resumo nutricional">
      {values.map(([label, value, unit]) => (
        <div key={label}><dt>{label}</dt><dd>{value}<span>{unit}</span></dd></div>
      ))}
    </dl>
  );
}

/** "45 min", "1h", "1h 30min" — o registro do que ja passou. */
function durationLabel(startedAt: string, finishedAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const remaining = minutes % 60;
  return `${Math.floor(minutes / 60)}h${remaining ? ` ${remaining}min` : ""}`;
}
