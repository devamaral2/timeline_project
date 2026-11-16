"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ICON_STROKE_WIDTH } from "@/components/tasks/task-visuals";
import type { FoodData, SleepData, TrainingData, WorkoutSnapshot } from "@repo/contracts";
import { formatDecimal, formatMinutes, formatPace, groupSetsByExercise, pluralize } from "@/lib/tasks/task-detail-format";
import { MarkdownView } from "./MarkdownView";
import { MealRecipeView } from "./MealRecipeView";
import { MealGenerationStatus } from "./MealGenerationStatus";
import styles from "./note-body.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** O texto de uma nota de texto ou roteador, em markdown. */
export function TextBody({ body }: { body: string }) {
  return <div className={styles.noteBody}><MarkdownView source={body} /></div>;
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
    <div>
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

function Calories({ value, kind }: { value: number; kind: "burned" | "consumed" }) {
  return (
    <span className={styles.kcal} role="img" aria-label={`${formatDecimal(value)} quilocalorias ${kind === "burned" ? "gastas" : "consumidas"}`}>
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

/** O número ao lado do principal (tempo ativo, tempo registrado): rótulo em cima, valor na serifa. */
function Metric({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} title={label} className={styles.metric}>
      <span className={styles.metricLabel}>{title}</span><span className={styles.metricValue}>{children}</span>
    </div>
  );
}

/** O número principal da nota: rótulo em cima e o valor em 56 px na serifa. */
function BigNumber({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.bigNumber}>
      <span className={styles.bigNumberLabel}>{label}</span><span className={styles.bigNumberValue}>{children}</span>
    </div>
  );
}

/** O quanto cada macro pesa nas calorias (proteína e carboidrato 4 kcal/g, gordura 9), para a barra e o rótulo dela. */
function macroShares(totals: FoodData["totals"]): [number, number, number] {
  const kcal = [totals.totalProteinGrams * 4, totals.totalCarbohydrateGrams * 4, totals.totalFatGrams * 9];
  const sum = kcal[0] + kcal[1] + kcal[2];
  if (sum <= 0) return [0, 0, 0];
  const shares = kcal.map((value) => Math.round((value / sum) * 100));
  return [shares[0] ?? 0, shares[1] ?? 0, shares[2] ?? 0];
}

function Macros({ totals }: { totals: FoodData["totals"] }) {
  const [protein, carbs, fat] = macroShares(totals);
  const items = [
    { key: "protein", name: "Proteínas", grams: totals.totalProteinGrams, share: protein },
    { key: "carbs", name: "Carboidratos", grams: totals.totalCarbohydrateGrams, share: carbs },
    { key: "fat", name: "Gorduras", grams: totals.totalFatGrams, share: fat },
  ] as const;
  return (
    <div className={styles.macroBlock}>
      {protein + carbs + fat > 0 ? (
        <div className={styles.macroBar} role="img" aria-label={`De onde vêm as calorias: ${items.map((item) => `${item.name.toLowerCase()} ${item.share}%`).join(", ")}`}>
          {items.map((item) => <i key={item.key} data-macro={item.key} style={{ flex: item.share }} />)}
        </div>
      ) : null}
      <div className={styles.macros}>
        {items.map((item) => (
          <div key={item.key} className={styles.macro} data-macro={item.key}>
            <span className={styles.macroName}><i />{item.name}</span>
            <span className={styles.macroLine}>
              <span className={styles.macroValue} role="img" aria-label={`${item.name}: ${formatDecimal(item.grams)} gramas`}>{formatDecimal(item.grams)}<small>g</small></span>
              {protein + carbs + fat > 0 ? <span className={styles.macroShare}>{item.share}%</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** O alimento (ou a refeição) que as duas telas desenham: os totais, a receita e os itens. */
export type FoodNoteData = Pick<FoodData, "description" | "items" | "totals" | "recipe" | "generation" | "nutritionSource">;

export function MealNote({ data }: { data: FoodNoteData }) {
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
      <section className={styles.noteBody} aria-label="Informações nutricionais">
        <div className={styles.figures}>
          <BigNumber label="Calorias consumidas">{formatDecimal(totals.totalCaloriesKcal)}<small>kcal</small></BigNumber>
        </div>
        <Macros totals={totals} />
        <MealGenerationStatus data={data} />
      </section>
      {data.items.length ? (
        <div className={styles.listBlock}>
          <h4 className={styles.listHeading}>Alimentos<span>{data.items.length}</span></h4>
          <ul className={styles.foods}>
            {data.items.map((food) => (
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
  if (workout.workoutCode === "walking" || workout.workoutCode === "treadmill" || workout.workoutCode === "running") {
    parts.push(`${formatDecimal(workout.distance)} km`, formatPace(workout.pace));
  } else if (workout.workoutCode === "weightlifting") {
    const exercises = groupSetsByExercise(workout.sets).length;
    parts.push(pluralize(exercises, "exercício", "exercícios"), pluralize(workout.sets.length, "série", "séries"));
  }
  return parts.join(" · ");
}

export function TrainingNote({ data }: { data: TrainingData }) {
  const active = data.workouts.reduce((sum, workout) => sum + workout.duration, 0);
  const burned = data.caloriesBurned || data.workouts.reduce((sum, workout) => sum + workout.calories, 0);
  return (
    <div className={styles.noteBody}>
      <div className={styles.figures}>
        <BigNumber label="Calorias gastas">{formatDecimal(burned)}<small>kcal</small></BigNumber>
        <Metric label={`Tempo ativo: ${formatMinutes(active)}`} title="Tempo ativo"><Duration minutes={active} /></Metric>
      </div>
      {data.workouts.length ? (
        <div className={styles.listBlock}>
          <h4 className={styles.listHeading}>Treinos<span>{data.workouts.length}</span></h4>
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

export function SleepNote({ data, agendaMinutes }: { data: SleepData; agendaMinutes: number | null }) {
  const score = Math.min(100, Math.max(0, data.score));
  return (
    <div className={styles.noteBody}>
      <div className={styles.figures}>
        <BigNumber label="Pontuação do sono">{data.score}<small>de 100</small></BigNumber>
        <Metric label={`Tempo registrado: ${formatMinutes(data.trackedSleepTime)}`} title="Tempo registrado"><Duration minutes={data.trackedSleepTime} /></Metric>
      </div>
      <div className={styles.scoreBar} role="img" aria-label={`Pontuação do sono: ${data.score} de 100`}><i style={{ width: `${score}%` }} /></div>
      {agendaMinutes !== null ? <p className={styles.noteFoot}>Registrado pelo app de sono. Na agenda, a tarefa durou {formatMinutes(agendaMinutes)}.</p> : null}
    </div>
  );
}
