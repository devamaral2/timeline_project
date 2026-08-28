"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type { EventDetailDto, EventPriority } from "@repo/entities/contracts";
import type { FoodItem } from "@repo/entities/contracts";
import { cn } from "@/lib/utils";
import { iconButtonClass } from "@/components/ui/button-styles";
import {
  addRowButtonClass,
  anyDecimalStep,
  emptyRowClass,
  fieldLabelClass,
  smallInputClass,
} from "../new-event-forms/field-styles";
import {
  CommonFields,
  type EditEventFormProps,
  FinishedAtField,
  FormActions,
  StartedAtField,
  EventMarks,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

type FoodEventDetail = Extract<EventDetailDto, { type: "food" }>;

interface ItemDraft {
  key: string;
  id?: string;
  food: string;
  isNew: boolean;
  portion: string;
  approximateWeightGrams: string;
  caloriesKcal: string;
  carbohydratesGrams: string;
  proteinsGrams: string;
  totalFatGrams: string;
  fiberGrams: string;
  mainMicronutrients: Record<string, number>;
  otherData: Record<string, number>;
}

function newKey(): string {
  return crypto.randomUUID();
}

function draftFromItem(item: FoodItem): ItemDraft {
  return {
    key: newKey(),
    id: item.id,
    food: item.food,
    isNew: false,
    portion: item.portion,
    approximateWeightGrams: String(item.approximateWeightGrams),
    caloriesKcal: String(item.caloriesKcal),
    carbohydratesGrams: String(item.macronutrients.carbohydratesGrams),
    proteinsGrams: String(item.macronutrients.proteinsGrams),
    totalFatGrams: String(item.macronutrients.totalFatGrams),
    fiberGrams: String(item.macronutrients.fiberGrams),
    mainMicronutrients: item.mainMicronutrients,
    otherData: item.otherData,
  };
}

function newItem(): ItemDraft {
  return {
    key: newKey(),
    food: "",
    isNew: true,
    portion: "",
    approximateWeightGrams: "",
    caloriesKcal: "",
    carbohydratesGrams: "",
    proteinsGrams: "",
    totalFatGrams: "",
    fiberGrams: "",
    mainMicronutrients: {},
    otherData: {},
  };
}



export function FoodEditForm({ eventId, event, onCancel, onClose, onUpdated }: EditEventFormProps<FoodEventDetail>) {
  const [items, setItems] = useState<ItemDraft[]>(event.data.items.map(draftFromItem));
  const [description, setDescription] = useState(event.description);
  const [tags, setTags] = useState<string[]>(event.tags);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(event.startedAt));
  const [finishedAt, setFinishedAt] = useState(toDatetimeLocalValue(event.finishedAt));
  const [missed, setMissed] = useState<boolean | undefined>(event.missed);
  const [priority, setPriority] = useState<EventPriority | undefined>(event.priority);
  const { submit, submitting, error } = useSubmitEventUpdate({ eventId, onUpdated, onClose });

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();

    const builtItems: FoodItem[] = items.map((item) => ({
      id: item.id,
      food: item.food.trim(),
      portion: item.portion.trim(),
      approximateWeightGrams: Number(item.approximateWeightGrams) || 0,
      caloriesKcal: Number(item.caloriesKcal) || 0,
      macronutrients: {
        carbohydratesGrams: Number(item.carbohydratesGrams) || 0,
        proteinsGrams: Number(item.proteinsGrams) || 0,
        totalFatGrams: Number(item.totalFatGrams) || 0,
        fiberGrams: Number(item.fiberGrams) || 0,
      },
      mainMicronutrients: item.mainMicronutrients,
      otherData: item.otherData,
    }));

    void submit({
      data: { items: builtItems },
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
        <span className={fieldLabelClass}>Itens da refeição</span>

        {items.length === 0 ? (
          <p className={emptyRowClass}>
            Nenhum item nesta refeição.
          </p>
        ) : null}

        {items.map((item) => (
          <div key={item.key} className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              {item.isNew ? (
                <input
                  type="text"
                  placeholder="Ex.: Arroz branco"
                  value={item.food}
                  onChange={(event) => updateItem(item.key, { food: event.target.value })}
                  className={cn(smallInputClass, "flex-1")}
                />
              ) : (
                <p className="flex-1 truncate text-[13.5px] font-medium text-foreground" title={item.food}>
                  {item.food}
                </p>
              )}
              <button
                type="button"
                onClick={() => setItems((current) => current.filter((current2) => current2.key !== item.key))}
                aria-label="Remover item"
                className={iconButtonClass}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Porção</label>
                <input
                  type="text"
                  value={item.portion}
                  onChange={(event) => updateItem(item.key, { portion: event.target.value })}
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Peso (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={item.approximateWeightGrams}
                  onChange={(event) => updateItem(item.key, { approximateWeightGrams: event.target.value })}
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Calorias</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={item.caloriesKcal}
                  onChange={(event) => updateItem(item.key, { caloriesKcal: event.target.value })}
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Carboidratos (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={item.carbohydratesGrams}
                  onChange={(event) => updateItem(item.key, { carbohydratesGrams: event.target.value })}
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Proteínas (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={item.proteinsGrams}
                  onChange={(event) => updateItem(item.key, { proteinsGrams: event.target.value })}
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Gorduras (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={item.totalFatGrams}
                  onChange={(event) => updateItem(item.key, { totalFatGrams: event.target.value })}
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Fibras (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={item.fiberGrams}
                  onChange={(event) => updateItem(item.key, { fiberGrams: event.target.value })}
                  className={smallInputClass}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setItems((current) => [...current, newItem()])}
          className={addRowButtonClass}
        >
          <Plus aria-hidden className="size-4" />
          Adicionar item
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
