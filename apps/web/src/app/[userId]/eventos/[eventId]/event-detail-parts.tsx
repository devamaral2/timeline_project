"use client";

import {
  ArrowDown, ArrowUp, CalendarCheck, CalendarDays, CalendarX, ChevronDown, ChevronUp, Clock, Droplet, Drumstick,
  Flame, Moon, StickyNote, Timer, Wheat,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import type { NoteDto, MealItem, SleepItem, TrainingData, WorkoutSnapshot } from "@/lib/api/contracts";
import type { EventPosition } from "@repo/timeline";
import { formatDecimal, formatMinutes, formatPace, groupSetsByExercise, pluralize } from "./event-detail-format";
import styles from "./event-details.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** Só o ícone, sem texto: agendado, em andamento, aconteceu ou não realizado. */
export function StatusIcon({ position, missed }: { position: EventPosition; missed: boolean }) {
  if (missed) return <CalendarX {...icon} className={styles.statusMissed} />;
  if (position === "past") return <CalendarCheck {...icon} className={styles.statusDone} />;
  if (position === "running") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={styles.statusRunning}>
        <path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><circle cx="12" cy="16" r="2.4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return <CalendarDays {...icon} className={styles.statusUpcoming} />;
}

export function statusLabelOf(position: EventPosition, missed: boolean): string {
  if (missed) return "Não realizado";
  if (position === "past") return "Aconteceu";
  return position === "running" ? "Em andamento" : "Vai acontecer";
}

/** Seção que abre dentro da própria página; fechada, já diz quanto tem dentro. */
export function Collapsible({ title, summary, trailing, defaultOpen = false, children }: {
  title: string; summary?: string; trailing?: ReactNode; defaultOpen?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronUp : ChevronDown;
  if (!children) {
    return (
      <div className={styles.row}>
        <div className={styles.rowText}><span className={styles.rowTitle}>{title}</span>{summary ? <span className={styles.rowSummary}>{summary}</span> : null}</div>
        {trailing}
      </div>
    );
  }
  return (
    <div className={styles.collapsible}>
      <button type="button" aria-expanded={open} className={styles.collapsibleToggle} onClick={() => setOpen((value) => !value)}>
        <span className={styles.rowHead}>
          <span className={styles.rowText}><span className={styles.rowTitle}>{title}</span>{summary ? <span className={styles.rowSummary}>{summary}</span> : null}</span>
          {trailing}
        </span>
        <span className={styles.chevron}><Chevron {...icon} /></span>
      </button>
      {open ? <div className={styles.collapsibleBody}>{children}</div> : null}
    </div>
  );
}

function KcalIcon({ kind }: { kind: "burned" | "consumed" }) {
  const Badge = kind === "burned" ? ArrowUp : ArrowDown;
  return <span className={styles.kcalIcon} data-kind={kind} aria-hidden><Flame {...icon} /><span className={styles.kcalBadge}><Badge {...icon} strokeWidth={2.5} /></span></span>;
}

function Calories({ value, kind }: { value: number; kind: "burned" | "consumed" }) {
  return (
    <span className={styles.kcal} data-kind={kind} role="img" aria-label={`${formatDecimal(value)} quilocalorias ${kind === "burned" ? "gastas" : "consumidas"}`}>
      <KcalIcon kind={kind} />
      <span className={styles.kcalValue}>{formatDecimal(value)}<small>kcal</small></span>
    </span>
  );
}

/** Horas e minutos com a unidade miúda: 7 h 02 min. */
function Duration({ minutes }: { minutes: number }) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return (
    <>
      {hours ? <>{hours}<small>h</small></> : null}
      {rest || !hours ? <>{hours ? String(rest).padStart(2, "0") : rest}<small>min</small></> : null}
    </>
  );
}

function Metric({ label, children, Icon }: { label: string; children: ReactNode; Icon: typeof Timer }) {
  return (
    <div role="img" aria-label={label} title={label} className={styles.metric}>
      <Icon {...icon} /><span className={styles.metricValue}>{children}</span>
    </div>
  );
}

function BigNumber({ label, children, icon: iconNode, tone }: { label: string; children: ReactNode; icon: ReactNode; tone: "burned" | "consumed" | "sleep" }) {
  return (
    <div className={styles.bigNumber} data-tone={tone}>
      {iconNode}
      <div><span className={styles.bigNumberLabel}>{label}</span><span className={styles.bigNumberValue}>{children}</span></div>
    </div>
  );
}

/** O cartão de nota anexada: número principal, uma linha, detalhes. */
export function NoteCard({ note, eventName, dateTitle, agendaMinutes }: {
  note: NoteDto; eventName: string; dateTitle: string; agendaMinutes: number | null;
}) {
  const [open, setOpen] = useState(true);
  let title: string;
  let body: ReactNode;
  if (note.type === "meal") { title = note.data.name || eventName; body = <MealNote data={note.data} />; }
  else if (note.type === "training") { title = eventName; body = <TrainingNote data={note.data} />; }
  else if (note.type === "sleep") { title = dateTitle; body = <SleepNote data={note.data} agendaMinutes={agendaMinutes} />; }
  else if (note.type === "text") { title = note.name; body = <TextNote body={note.data.body} />; }
  else return null;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <section aria-label="Notas do evento">
      <div className={styles.sectionLabel}><h2>Notas</h2><span>1</span></div>
      <article className={styles.note}>
        <button type="button" aria-expanded={open} className={styles.noteToggle} onClick={() => setOpen((value) => !value)}>
          <span className={styles.noteHead}>
            <span className={styles.noteKind}><StickyNote {...icon} />Nota</span>
            <span className={styles.noteTitle}>{title}</span>
          </span>
          <Chevron {...icon} />
        </button>
        {open ? body : null}
      </article>
    </section>
  );
}

function TextNote({ body }: { body: string }) {
  return (
    <div className={styles.noteBody}>
      <p className={styles.noteText}>{body}</p>
    </div>
  );
}

function MealNote({ data }: { data: MealItem }) {
  const { totals } = data;
  return (
    <div className={styles.noteBody}>
      {data.description ? <p className={styles.noteText}>{data.description}</p> : null}
      <h3 className={styles.noteHeading}>Informações nutricionais</h3>
      <BigNumber label="Calorias consumidas" tone="consumed" icon={<KcalIcon kind="consumed" />}>{formatDecimal(totals.totalCaloriesKcal)}<small>kcal</small></BigNumber>
      <hr />
      <div className={styles.metrics} data-columns="3">
        <Metric label={`Carboidratos: ${formatDecimal(totals.totalCarbohydrateGrams)} gramas`} Icon={Wheat}>{formatDecimal(totals.totalCarbohydrateGrams)}<small>g</small></Metric>
        <Metric label={`Proteína: ${formatDecimal(totals.totalProteinGrams)} gramas`} Icon={Drumstick}>{formatDecimal(totals.totalProteinGrams)}<small>g</small></Metric>
        <Metric label={`Gorduras: ${formatDecimal(totals.totalFatGrams)} gramas`} Icon={Droplet}>{formatDecimal(totals.totalFatGrams)}<small>g</small></Metric>
      </div>
      {data.foodItems.length ? (
        <div>
          <h4 className={styles.listHeading}>Alimentos</h4>
          <ul className={styles.foods}>
            {data.foodItems.map((food) => (
              <li key={food.id}>
                <div className={styles.rowText}><span className={styles.foodName}>{food.name}</span><span className={styles.rowSummary}>{food.portion || `${formatDecimal(food.approximateWeightGrams)} g`}</span></div>
                <Calories value={food.caloriesKcal} kind="consumed" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function workoutSummary(workout: WorkoutSnapshot): string {
  const parts = [formatMinutes(workout.duration)];
  if (workout.workoutCode === "treadmill" || workout.workoutCode === "running") {
    parts.push(`${formatDecimal(workout.distance)} km`, formatPace(workout.pace));
  } else if (workout.workoutCode === "weightlifting") {
    const exercises = groupSetsByExercise(workout.sets).length;
    parts.push(pluralize(exercises, "exercício", "exercícios"), pluralize(workout.sets.length, "série", "séries"));
  }
  return parts.join(" · ");
}

function TrainingNote({ data }: { data: TrainingData }) {
  const active = data.workouts.reduce((sum, workout) => sum + workout.duration, 0);
  const burned = data.caloriesBurned || data.workouts.reduce((sum, workout) => sum + workout.calories, 0);
  return (
    <div className={styles.noteBody}>
      <BigNumber label="Calorias gastas" tone="burned" icon={<KcalIcon kind="burned" />}>{formatDecimal(burned)}<small>kcal</small></BigNumber>
      <hr />
      <div className={styles.metrics}>
        <Metric label={`Tempo ativo: ${formatMinutes(active)}`} Icon={Timer}><Duration minutes={active} /></Metric>
      </div>
      {data.workouts.length ? (
        <div>
          <h4 className={styles.listHeading}>Treinos</h4>
          <div className={styles.workouts}>
            {data.workouts.map((workout) => {
              const trailing = <Calories value={workout.calories} kind="burned" />;
              const sets = workout.workoutCode === "weightlifting" ? groupSetsByExercise(workout.sets) : [];
              return (
                <Collapsible key={workout.id} title={workout.workoutName} summary={workoutSummary(workout)} trailing={trailing}>
                  {sets.length ? (
                    <div className={styles.exercises}>
                      {sets.map((group) => (
                        <div key={group.exercise}>
                          <div className={styles.exerciseHead}><span>{group.exercise}</span><span>{pluralize(group.sets.length, "série", "séries")}</span></div>
                          <div className={styles.chips}>{group.sets.map((set) => <span key={set.id}>{set.repetitions} × {formatDecimal(set.weight)} kg</span>)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Collapsible>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SleepNote({ data, agendaMinutes }: { data: SleepItem; agendaMinutes: number | null }) {
  return (
    <div className={styles.noteBody}>
      <BigNumber label="Pontuação do sono" tone="sleep" icon={<span className={styles.sleepIcon}><Moon {...icon} /></span>}>
        {data.score}<small>de 100</small>
      </BigNumber>
      <hr />
      <div className={styles.metrics}>
        <Metric label={`Tempo registrado: ${formatMinutes(data.trackedSleepTime)}`} Icon={Clock}>
          <Duration minutes={data.trackedSleepTime} />
        </Metric>
      </div>
      {agendaMinutes !== null ? <p className={styles.noteFoot}>Registrado pelo app de sono. Na agenda, o evento durou {formatMinutes(agendaMinutes)}.</p> : null}
    </div>
  );
}
