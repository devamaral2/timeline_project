"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/tasks/task-visuals";
import { tagColorStyle } from "@/lib/tags/tag-color";
import {
  RAIL_DAYS,
  RAIL_NOW,
  type RailEntry,
  type RailGap,
  clockOf,
  durationLabel,
  railHeightOf,
  railItemsOf,
  scheduledMinutesOf,
} from "./task-rail-data";
import styles from "./task-rail.module.css";

/** Altura mínima e máxima de cada faixa do trilho, em pixels. */
const TASK_HEIGHT = { min: 56, max: 150 } as const;
const GAP_HEIGHT = { min: 40, max: 132 } as const;

export function TaskRail() {
  const [dayIndex, setDayIndex] = useState(() => RAIL_DAYS.findIndex((day) => day.relation === "today"));
  const day = RAIL_DAYS[dayIndex];
  const items = railItemsOf(day, RAIL_NOW);
  const count = day.tasks.length;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>Agente pessoal</span>
        <span className={styles.pill}>Protótipo</span>
      </header>

      <main className={styles.main}>
        <div className={styles.dayHead}>
          <div>
            <p className={styles.dateLine}>{day.dateLine}</p>
            <h1 className={styles.dayTitle}>{day.label}</h1>
            <p className={styles.dayStats}>
              {count} {count === 1 ? "compromisso" : "compromissos"} · {durationLabel(scheduledMinutesOf(day))} agendados
            </p>
          </div>

          <nav className={styles.dayNav} aria-label="Trocar de dia">
            <button
              type="button"
              className={styles.navButton}
              aria-label="Dia anterior"
              disabled={dayIndex === 0}
              onClick={() => setDayIndex((index) => Math.max(0, index - 1))}
            >
              <ChevronLeft aria-hidden strokeWidth={ICON_STROKE_WIDTH} />
            </button>
            <button
              type="button"
              className={styles.navButton}
              aria-label="Próximo dia"
              disabled={dayIndex === RAIL_DAYS.length - 1}
              onClick={() => setDayIndex((index) => Math.min(RAIL_DAYS.length - 1, index + 1))}
            >
              <ChevronRight aria-hidden strokeWidth={ICON_STROKE_WIDTH} />
            </button>
          </nav>
        </div>

        {items.length === 0 ? (
          <p className={styles.empty}>Um dia livre, do seu jeito.</p>
        ) : (
          <ol className={styles.rail} aria-label={`Tarefas de ${day.label.toLowerCase()}`}>
            {items.map((item) =>
              item.kind === "free" ? (
                <FreeRow key={`free-${item.start}`} gap={item} />
              ) : (
                <TaskRow key={item.task.id} entry={item} />
              ),
            )}
          </ol>
        )}
      </main>
    </div>
  );
}

function TaskRow({ entry }: { entry: RailEntry }) {
  const { task, status } = entry;
  const { Icon, label } = visualForItemType(task.type);
  const minutes = task.end - task.start;
  const height = railHeightOf(minutes, TASK_HEIGHT.min, TASK_HEIGHT.max);
  const elapsed = RAIL_NOW - task.start;
  const progress = Math.min(100, Math.max(0, Math.round((elapsed / minutes) * 100)));

  return (
    <li
      className={styles.row}
      data-status={status}
      style={{ "--h": `${height}px`, "--progress": `${progress}%` } as CSSProperties}
    >
      <p className={styles.time}>
        <span>{clockOf(task.start)}</span>
        <small>{clockOf(task.end)}</small>
      </p>

      <span className={styles.spine} aria-hidden>
        <span className={styles.segment} />
      </span>

      <article className={styles.task}>
        <Icon className={styles.icon} strokeWidth={ICON_STROKE_WIDTH} aria-label={label} role="img" />

        <div className={styles.body}>
          <h3 className={styles.name}>{task.name}</h3>
          <p className={styles.meta}>
            <span>{durationLabel(minutes)}</span>
            {task.tags.map((tag) => (
              <span key={tag} className={styles.tag} style={tagColorStyle(tag)}>
                #{tag}
              </span>
            ))}
          </p>
        </div>

        <StatusLabel status={status} elapsed={elapsed} />
      </article>
    </li>
  );
}

function StatusLabel({ status, elapsed }: { status: RailEntry["status"]; elapsed: number }) {
  if (status === "running") {
    return <span className={styles.live}>Em andamento · {durationLabel(elapsed)}</span>;
  }
  if (status === "missed") {
    return <span className={styles.missed}>Não realizado</span>;
  }
  return null;
}

function FreeRow({ gap }: { gap: RailGap }) {
  const minutes = gap.end - gap.start;
  const height = railHeightOf(minutes, GAP_HEIGHT.min, GAP_HEIGHT.max);

  return (
    <li className={styles.row} data-kind="free" style={{ "--h": `${height}px` } as CSSProperties}>
      <p className={styles.time} aria-hidden />

      <span className={styles.spine} aria-hidden />

      <div className={styles.gap}>
        <p className={styles.gapLabel}>Tempo livre</p>
        <p className={styles.gapFigure}>{durationLabel(minutes)}</p>
      </div>
    </li>
  );
}
