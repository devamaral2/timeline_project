"use client";

import {
  ArrowDown, ArrowUp, ChevronDown, ChevronUp, Clock, Droplet, Drumstick, Flame, Moon, Timer, Wheat,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import type { MealItem, NoteDto, SleepItem, TrainingData, WorkoutSnapshot } from "@/lib/api/contracts";
import { formatDecimal, formatMinutes, formatPace, groupSetsByExercise, pluralize } from "@/lib/events/event-detail-format";
import { MarkdownView } from "./MarkdownView";
import { MealRecipeView } from "./MealRecipeView";
import { MealGenerationStatus } from "./MealGenerationStatus";
import styles from "./note-body.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/**
 * O corpo de uma nota, igual onde quer que ela apareça (cartão do evento e
 * detalhe da nota): o markdown de uma nota de texto, ou o número principal,
 * as métricas e a lista de uma refeição, treino ou sono. `agendaMinutes` só
 * existe dentro de um evento, e só o sono o usa.
 */
export function NoteBody({ note, agendaMinutes = null }: { note: NoteDto; agendaMinutes?: number | null }) {
  switch (note.type) {
    case "text":
      return <div className={styles.noteBody}><MarkdownView source={note.data.body} /></div>;
    case "meal":
      return <MealNote data={note.data} />;
    case "training":
      return <TrainingNote data={note.data} />;
    case "sleep":
      return <SleepNote data={note.data} agendaMinutes={agendaMinutes} />;
    default:
      return null;
  }
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

function MealNote({ data }: { data: MealItem }) {
  const { totals } = data;
  if (data.generation?.status === "pending" || data.generation?.status === "failed") {
    return <div className={styles.noteBody}>
      {data.description ? <p className={styles.noteText}>{data.description}</p> : null}
      <MealGenerationStatus data={data} />
    </div>;
  }
  return (
    <div className={styles.noteBody}>
      {data.description ? <p className={styles.noteText}>{data.description}</p> : null}
      <MealGenerationStatus data={data} />
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
      {data.recipe ? <MealRecipeView recipe={data.recipe} /> : null}
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
