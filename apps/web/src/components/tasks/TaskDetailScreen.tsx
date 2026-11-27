"use client";

import {
  ArrowLeft, Bell, Check, Circle, CircleCheck, CircleDashed, CirclePause, CircleSlash,
  Flag, MoreVertical, Pencil, Trash2, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  compactDate, dayKeyOf, elapsedSecondsOf, formatStopwatch,
  formatTime, longDate, type TaskPosition,
} from "@repo/timeline";
import type { FoodRecipe, SleepData, TaskCardDto, TaskPriority, TextData, TrainingData } from "@repo/contracts";
import { isFreeTextArtifact } from "@repo/contracts/artifact-types";
import { positionOf } from "@/lib/tasks/task-window";
import { useNow } from "@/lib/tasks/use-now";
import { ICON_STROKE_WIDTH, missedLabel, notificationOffsetLabel, visualForItemType } from "./task-visuals";
import { MarkdownView } from "@/components/notes/MarkdownView";
import { MealRecipeView } from "@/components/notes/MealRecipeView";
import { MealGenerationStatus } from "@/components/notes/MealGenerationStatus";
import styles from "./task-detail-screen.module.css";

/*
 * Os dados que a prévia desenha. São a forma local do exemplo, não o contrato da API:
 * a tela real lê a tarefa com `getTask` (ver `@repo/contracts`).
 */
export type PreviewPriority = "urgent" | "normal" | "flexible";
type PreviewStatus = Extract<NonNullable<TaskCardDto["status"]>, "todo" | "toDefine" | "inHold" | "done" | "cancel">;

const previewPriorityLabels: Record<PreviewPriority, string> = {
  urgent: "Urgente",
  normal: "Normal",
  flexible: "Flexível",
};

export interface PreviewLinkedTask {
  id: string;
  name: string;
  description: string;
  status: PreviewStatus;
  priority: TaskPriority;
  notifyOffsetsMinutes: number[];
  tags: string[];
  dependsOnTaskIds: string[];
  revision: number;
}

export interface PreviewMeal {
  name: string;
  description: string;
  totals: {
    totalCaloriesKcal: number;
    totalProteinGrams: number;
    totalCarbohydrateGrams: number;
    totalFatGrams: number;
    totalFiberGrams: number;
  };
  recipe?: FoodRecipe;
  generation?: { status: "pending" | "completed" | "failed" };
  nutritionSource?: "model-estimate";
}

interface PreviewNoteBase {
  id: string;
  name: string;
}

/** Uma nota da tarefa na prévia: a refeição, o treino, o sono ou o texto. */
export type PreviewNote =
  | (PreviewNoteBase & { type: "meal"; data: PreviewMeal })
  | (PreviewNoteBase & { type: "training"; data: TrainingData })
  | (PreviewNoteBase & { type: "sleep"; data: SleepData })
  | (PreviewNoteBase & { type: "text"; data: TextData });

export interface PreviewInterruption {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt: string;
}

export interface PreviewTask {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  missed: boolean;
  priority: PreviewPriority;
  notifyOffsetsMinutes: number[];
  interruptions: PreviewInterruption[];
  revision: number;
  kind: string;
  notes: PreviewNote[];
  taskIds?: string[];
}

/**
 * O que a tela faz alem de mostrar. Ausente, o menu aparece desligado — e o
 * que o estudo visual precisa, e evita um menu que promete acao e nao cumpre.
 */
export interface TaskDetailActions {
  onEdit: () => void;
  onToggleMissed: () => void;
  onDelete: () => void;
  savingMissed: boolean;
}

export interface TaskDetailScreenProps {
  task: PreviewTask;
  /** As tarefas vinculadas, ja resolvidas por quem carregou a tarefa. */
  linkedTasks?: PreviewLinkedTask[];
  backHref: string;
  actions?: TaskDetailActions;
  /** Mensagem de erro de uma acao — some quando a acao da certo. */
  actionError?: string | null;
}

/**
 * A tela de detalhe da tarefa.
 *
 * A composicao e a mesma para todo tipo: navegacao, tipo, nome com a data ao
 * lado, o cartao de resumo — horario, duracao, metadados, tags e a situacao no
 * tempo — e as secoes de texto (descricao, tarefas, notas). O que o tipo do
 * tarefa traz de proprio entra como mais uma secao entre a descricao e as
 * tarefas; o esqueleto nao muda.
 */
export function TaskDetailScreen({ task, linkedTasks = [], backHref, actions, actionError }: TaskDetailScreenProps) {
  const visual = visualForItemType(task.kind);
  const TypeIcon = visual.Icon;
  const dayKey = dayKeyOf(task.startedAt);

  return (
    <div className={styles.screen}>
      <nav className={styles.topBar} aria-label="Navegação da tarefa">
        <Link href={backHref} className={styles.iconAction} aria-label="Voltar para a agenda">
          <ArrowLeft aria-hidden />
        </Link>
        <TaskMenu missed={task.missed} actions={actions} />
      </nav>

      <header data-type={task.kind}>
        <p className={styles.type}>
          <TypeIcon aria-hidden strokeWidth={ICON_STROKE_WIDTH} />
          {visual.label}
        </p>
        <div className={styles.titleRow}>
          <h1>{task.name}</h1>
          <time className={styles.headingDate} dateTime={dayKey} title={longDate(dayKey)}>
            {compactDate(dayKey)}
          </time>
        </div>
      </header>

      <TaskSummary task={task} dayKey={dayKey} />

      <Section title="Descrição">
        {task.description
          ? <p className={styles.prose}>{task.description}</p>
          : <p className={styles.empty}>Sem descrição.</p>}
      </Section>

      {task.notes.map((note) => <NoteSection key={note.id} note={note} />)}

      {task.interruptions.length ? (
        <Section title="Interrupções">
          <ul className={styles.list}>
            {task.interruptions.map((interruption) => (
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
        {linkedTasks.length ? (
          <ul className={styles.tasks}>
            {linkedTasks.map((linkedTask) => {
              const { Icon, label } = statusView[linkedTask.status] ?? statusView.todo;
              return (
                <li key={linkedTask.id} data-done={linkedTask.status === "done"}>
                  <Icon role="img" aria-label={label} />
                  <span>{linkedTask.name}</span>
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
 * tarefa, como ele esta marcado e em que ponto do tempo ele esta.
 */
function TaskSummary({ task, dayKey }: { task: PreviewTask; dayKey: string }) {
  const now = useNow();
  // Sem relogio nao ha situacao no tempo: o HTML do servidor nasce num instante
  // e hidrata em outro, e os dois discordariam de uma tarefa que acabou de virar.
  const position = now ? positionOf(task, now) : null;
  const running = position === "running";
  const endDayKey = task.finishedAt ? dayKeyOf(task.finishedAt) : null;
  const metadata = metadataOf(task);

  return (
    <section className={styles.summary} aria-label="Resumo da tarefa">
      <div className={styles.schedule}>
        <p className={styles.range}>
          <time dateTime={task.startedAt}>{formatTime(task.startedAt)}</time>
          <span className={styles.separator} aria-hidden>–</span>
          {task.finishedAt ? (
            <time dateTime={task.finishedAt}>
              {formatTime(task.finishedAt)}
              {endDayKey && endDayKey !== dayKey ? (
                <span className={styles.endsOnAnotherDay}>{longDate(endDayKey)}</span>
              ) : null}
            </time>
          ) : (
            <span className={styles.openEnd}>{running ? "em andamento" : "sem hora de fim"}</span>
          )}
        </p>
        <DurationReadout task={task} now={now} running={running} />
      </div>

      {metadata.length ? (
        <ul className={styles.metadata}>
          {metadata.map(({ Icon, text }) => (
            <li key={text}><Icon aria-hidden />{text}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.summaryFoot}>
        <ul className={styles.tags} aria-label="Tags da tarefa">
          {task.missed ? <li className={styles.missed}>{missedLabel}</li> : null}
          {task.tags.map((tag) => <li key={tag}>{tag}</li>)}
        </ul>
        <PositionBadge position={position} />
      </div>
    </section>
  );
}

/**
 * O numero a direita do horario: a duracao de uma tarefa encerrada ou o
 * cronometro de uma que ainda corre. Sao formatos diferentes de proposito —
 * "1h 30min" e registro, "1:30:07" e um numero subindo.
 */
function DurationReadout({ task, now, running }: { task: PreviewTask; now: Date | null; running: boolean }) {
  if (running && now) {
    return (
      <p className={`${styles.duration} ${styles.live}`} title="Tempo decorrido">
        {formatStopwatch(elapsedSecondsOf(task.startedAt, now))}
      </p>
    );
  }
  if (!task.finishedAt) return null;
  return <p className={styles.duration}>{durationLabel(task.startedAt, task.finishedAt)}</p>;
}

const positionLabels: Record<TaskPosition, string> = {
  past: "Já aconteceu",
  running: "Acontecendo agora",
  upcoming: "Ainda vai acontecer",
};

/**
 * A situacao da tarefa no tempo, num quadro so. Antes da hidratacao ele fica
 * vazio — um estado errado por um quadro le como informacao, nao como espera.
 */
function PositionBadge({ position }: { position: TaskPosition | null }) {
  if (!position) return <span className={styles.position} aria-hidden />;
  return (
    <span className={styles.position} data-position={position} role="img" aria-label={positionLabels[position]} title={positionLabels[position]}>
      {position === "past" ? <Check aria-hidden /> : <i />}
    </span>
  );
}

/** O menu da tarefa: editar, anotar o que nao aconteceu, excluir. */
function TaskMenu({ missed, actions }: { missed: boolean; actions?: TaskDetailActions }) {
  if (!actions) {
    return (
      <button type="button" disabled className={styles.iconAction} aria-label="Mais opções da tarefa">
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
      onKeyDown={(keyboardTask) => {
        if (keyboardTask.key !== "Escape") return;
        keyboardTask.currentTarget.open = false;
        keyboardTask.currentTarget.querySelector("summary")?.focus();
      }}
      onBlur={(focusTask) => {
        if (!focusTask.currentTarget.contains(focusTask.relatedTarget)) focusTask.currentTarget.open = false;
      }}
    >
      <summary className={styles.iconAction} aria-label="Mais opções da tarefa" title="Mais opções da tarefa">
        <MoreVertical aria-hidden />
      </summary>
      <div className={styles.menuPanel}>
        <button type="button" onClick={(click) => run(click.currentTarget, actions.onEdit)}>
          <Pencil aria-hidden />Editar tarefa
        </button>
        <button type="button" disabled={actions.savingMissed} onClick={(click) => run(click.currentTarget, actions.onToggleMissed)}>
          <CircleSlash aria-hidden />
          {missed ? `Desmarcar "${missedLabel}"` : `Marcar como ${missedLabel.toLowerCase()}`}
        </button>
        <button type="button" className={styles.danger} onClick={(click) => run(click.currentTarget, actions.onDelete)}>
          <Trash2 aria-hidden />Excluir tarefa
        </button>
      </div>
    </details>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2>{children}</section>;
}

const statusView: Record<PreviewStatus, { Icon: LucideIcon; label: string }> = {
  todo: { Icon: Circle, label: "A fazer" },
  toDefine: { Icon: CircleDashed, label: "A definir" },
  inHold: { Icon: CirclePause, label: "Em espera" },
  done: { Icon: CircleCheck, label: "Concluída" },
  cancel: { Icon: CircleSlash, label: "Cancelada" },
};

/**
 * Os metadados que a tarefa carrega hoje. A prioridade normal nao aparece:
 * dizer "Normal" gasta uma linha para nao informar nada.
 */
function metadataOf(task: PreviewTask): Array<{ Icon: LucideIcon; text: string }> {
  const rows: Array<{ Icon: LucideIcon; text: string }> = [];
  if (task.priority !== "normal") rows.push({ Icon: Flag, text: previewPriorityLabels[task.priority] });
  if (task.notifyOffsetsMinutes.length) {
    rows.push({ Icon: Bell, text: task.notifyOffsetsMinutes.map(notificationOffsetLabel).join(" · ") });
  }
  return rows;
}

function NoteSection({ note }: { note: PreviewNote }) {
  if (note.type === "meal") return (
    <Section title="Refeição">
      <p className={styles.prose}>{note.data.name}</p>
      {note.data.description ? <p className={styles.secondary}>{note.data.description}</p> : null}
      <Nutrition data={note.data} />
      {note.data.recipe ? <MealRecipeView recipe={note.data.recipe} /> : null}
    </Section>
  );

  if (note.type === "training" && note.data.workouts.length) return (
    <Section title="Treinos">
      <ul className={styles.list}>
        {note.data.workouts.map((workout) => (
          <li key={workout.id}>
            <p>{workout.workoutName}</p>
            <span>{workout.duration} min · {workout.calories} kcal</span>
          </li>
        ))}
      </ul>
    </Section>
  );

  if (note.type === "sleep") return (
    <Section title="Sono">
      <p className={styles.prose}>
        {note.data.trackedSleepTime} min monitorados
        <span className={styles.secondary}> · pontuação {note.data.score}</span>
      </p>
    </Section>
  );

  if (isFreeTextArtifact(note)) return (
    <Section title={note.name}>
      <MarkdownView source={note.data.body} />
    </Section>
  );

  return null;
}

function Nutrition({ data }: { data: PreviewMeal }) {
  if (data.generation?.status === "pending" || data.generation?.status === "failed") {
    return <MealGenerationStatus data={data} />;
  }
  const values = [
    ["Calorias", data.totals.totalCaloriesKcal, "kcal"],
    ["Proteína", data.totals.totalProteinGrams, "g"],
    ["Carboidratos", data.totals.totalCarbohydrateGrams, "g"],
    ["Gorduras", data.totals.totalFatGrams, "g"],
  ] as const;

  return (
    <><MealGenerationStatus data={data} /><dl className={styles.nutrition} aria-label="Resumo nutricional">
      {values.map(([label, value, unit]) => (
        <div key={label}><dt>{label}</dt><dd>{value}<span>{unit}</span></dd></div>
      ))}
    </dl></>
  );
}

/** "45 min", "1h", "1h 30min" — o registro do que ja passou. */
function durationLabel(startedAt: string, finishedAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const remaining = minutes % 60;
  return `${Math.floor(minutes / 60)}h${remaining ? ` ${remaining}min` : ""}`;
}
