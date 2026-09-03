"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type { EventPriority, WorkoutCode, WorkoutSnapshot } from "@repo/entities/contracts";
import { cn } from "@/lib/utils";
import { iconButtonClass } from "@/components/ui/button-styles";
import {
  addRowButtonClass,
  anyDecimalStep,
  emptyRowClass,
  fieldInputClass,
  fieldLabelClass,
  inlineLinkClass,
  smallInputClass,
} from "../new-event-forms/field-styles";
import { workoutCodeLabels } from "../new-event-forms/workout-codes";
import {
  CommonFields,
  type EditEventFormProps,
  FinishedAtField,
  FormActions,
  type ItemOfType,
  StartedAtField,
  EventMarks,
  fromDatetimeLocalValue,
  itemsPatchedWith,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

interface SetDraft {
  key: string;
  id?: string;
  exercise: string;
  repetitions: string;
  weight: string;
}

interface WorkoutDraft {
  key: string;
  id?: string;
  workoutCode: WorkoutCode;
  /**
   * O nome que veio do catalogo, guardado so para devolve-lo igual. A API o
   * reescreve a partir do `workoutCode` — mas o payload de treino o exige, e
   * inventar um aqui seria dizer ao servidor uma coisa que ele nao perguntou.
   */
  workoutName: string;
  calories: string;
  duration: string;
  pace: string;
  distance: string;
  sets: SetDraft[];
}

function newKey(): string {
  return crypto.randomUUID();
}

function newWorkout(): WorkoutDraft {
  return {
    key: newKey(),
    workoutCode: "free",
    workoutName: "",
    calories: "",
    duration: "",
    pace: "",
    distance: "",
    sets: [],
  };
}

function newSet(): SetDraft {
  return { key: newKey(), exercise: "", repetitions: "", weight: "" };
}

function draftFromWorkout(workout: WorkoutSnapshot): WorkoutDraft {
  return {
    key: newKey(),
    id: workout.id,
    workoutCode: workout.workoutCode,
    workoutName: workout.workoutName,
    calories: String(workout.calories),
    duration: String(workout.duration),
    pace: "pace" in workout ? String(workout.pace) : "",
    distance: "distance" in workout ? String(workout.distance) : "",
    sets:
      workout.workoutCode === "weightlifting"
        ? workout.sets.map((set) => ({
            key: newKey(),
            id: set.id,
            exercise: set.exercise,
            repetitions: String(set.repetitions),
            weight: String(set.weight),
          }))
        : [],
  };
}

const selectClass = fieldInputClass + " pr-8";

export function TrainingEditForm({
  event,
  item,
  onCancel,
  onClose,
  onUpdated,
}: EditEventFormProps<ItemOfType<"training">>) {
  const [workouts, setWorkouts] = useState<WorkoutDraft[]>(item.data.workouts.map(draftFromWorkout));
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState<string[]>(event.tags);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const [finishedAt, setFinishedAt] = useState(toDatetimeLocalValue(event.finishedAt));
  const [missed, setMissed] = useState<boolean | undefined>(event.missed);
  const [priority, setPriority] = useState<EventPriority | undefined>(event.priority);
  const { submit, submitting, error } = useSubmitEventUpdate({
    eventId: event.id,
    onUpdated,
    onClose,
  });

  function updateWorkout(key: string, patch: Partial<WorkoutDraft>) {
    setWorkouts((current) => current.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  }

  function updateSet(workoutKey: string, setKey: string, patch: Partial<SetDraft>) {
    setWorkouts((current) =>
      current.map((w) =>
        w.key === workoutKey
          ? { ...w, sets: w.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) }
          : w,
      ),
    );
  }

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();

    const builtWorkouts: WorkoutSnapshot[] = workouts.map((w) => {
      const base = {
        id: w.id ?? newKey(),
        workoutName: w.workoutName,
        calories: Number(w.calories) || 0,
        duration: Number(w.duration) || 0,
      };
      if (w.workoutCode === "weightlifting") {
        return {
          ...base,
          workoutCode: "weightlifting",
          sets: w.sets.map((s) => ({
            id: s.id ?? newKey(),
            exercise: s.exercise.trim(),
            repetitions: Number(s.repetitions) || 0,
            weight: Number(s.weight) || 0,
          })),
        };
      }
      if (w.workoutCode === "free") return { ...base, workoutCode: "free" };
      return {
        ...base,
        workoutCode: w.workoutCode,
        pace: Number(w.pace) || 0,
        distance: Number(w.distance) || 0,
      };
    });

    void submit({
      expectedRevision: event.revision,
      // `caloriesBurned` e a soma dos treinos, e a API a recalcula do mesmo
      // jeito — mandar outra coisa daqui so criaria uma divergencia que o
      // servidor descartaria.
      items: itemsPatchedWith(event, item.id, {
        workouts: builtWorkouts,
        caloriesBurned: builtWorkouts.reduce((total, workout) => total + workout.calories, 0),
      }),
      description: description.trim(),
      tags,
      startedAt: fromDatetimeLocalValue(startedAt),
      finishedAt: fromDatetimeLocalValue(finishedAt),
      missed,
      priority,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <span className={fieldLabelClass}>Treinos</span>

        {workouts.length === 0 ? <p className={emptyRowClass}>Nenhum treino adicionado ainda.</p> : null}

        {workouts.map((workout) => (
          <div key={workout.key} className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <select
                value={workout.workoutCode}
                onChange={(selectEvent) =>
                  updateWorkout(workout.key, {
                    workoutCode: selectEvent.target.value as WorkoutCode,
                  })
                }
                className={selectClass}
              >
                {Object.entries(workoutCodeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setWorkouts((current) => current.filter((w) => w.key !== workout.key))}
                aria-label="Remover treino"
                className={cn("ml-auto", iconButtonClass)}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Calorias</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={workout.calories}
                  onChange={(inputEvent) =>
                    updateWorkout(workout.key, { calories: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Duração (min)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={workout.duration}
                  onChange={(inputEvent) =>
                    updateWorkout(workout.key, { duration: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>

              {workout.workoutCode === "treadmill" || workout.workoutCode === "running" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] text-muted-foreground">Ritmo (min/km)</label>
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      value={workout.pace}
                      onChange={(inputEvent) =>
                        updateWorkout(workout.key, { pace: inputEvent.target.value })
                      }
                      className={smallInputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] text-muted-foreground">Distância (km)</label>
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      value={workout.distance}
                      onChange={(inputEvent) =>
                        updateWorkout(workout.key, { distance: inputEvent.target.value })
                      }
                      className={smallInputClass}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {workout.workoutCode === "weightlifting" ? (
              <div className="flex flex-col gap-2">
                {workout.sets.map((set) => (
                  <div key={set.key} className="flex items-center gap-1.5 sm:gap-2">
                    <input
                      type="text"
                      placeholder="Exercício"
                      value={set.exercise}
                      onChange={(inputEvent) =>
                        updateSet(workout.key, set.key, { exercise: inputEvent.target.value })
                      }
                      className={cn(smallInputClass, "min-w-0 flex-1")}
                    />
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      placeholder="Reps"
                      value={set.repetitions}
                      onChange={(inputEvent) =>
                        updateSet(workout.key, set.key, { repetitions: inputEvent.target.value })
                      }
                      className={cn(smallInputClass, "w-12 min-w-0 shrink-0 sm:w-16")}
                    />
                    <input
                      type="number"
                      min={0}
                      step={anyDecimalStep}
                      placeholder="Kg"
                      value={set.weight}
                      onChange={(inputEvent) =>
                        updateSet(workout.key, set.key, { weight: inputEvent.target.value })
                      }
                      className={cn(smallInputClass, "w-12 min-w-0 shrink-0 sm:w-16")}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateWorkout(workout.key, {
                          sets: workout.sets.filter((s) => s.key !== set.key),
                        })
                      }
                      aria-label="Remover série"
                      className={iconButtonClass}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => updateWorkout(workout.key, { sets: [...workout.sets, newSet()] })}
                  className={inlineLinkClass}
                >
                  <Plus aria-hidden className="size-3.5" />
                  Adicionar série
                </button>
              </div>
            ) : null}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setWorkouts((current) => [...current, newWorkout()])}
          className={addRowButtonClass}
        >
          <Plus aria-hidden className="size-4" />
          Adicionar treino
        </button>
      </div>

      <CommonFields
        description={description}
        onDescriptionChange={setDescription}
        tags={tags}
        onTagsChange={setTags}
      />

      <StartedAtField value={startedAt} onChange={setStartedAt} />
      <FinishedAtField value={finishedAt} onChange={setFinishedAt} />

      <EventMarks
        missed={missed}
        onMissedChange={setMissed}
        priority={priority}
        onPriorityChange={setPriority}
      />

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <FormActions
        onBack={onCancel}
        submitting={submitting}
        submitLabel="Salvar alterações"
        submittingLabel="Salvando..."
        backLabel="Cancelar"
      />
    </form>
  );
}
