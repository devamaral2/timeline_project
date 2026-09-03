"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import type { EventPriority, FoodItem } from "@repo/entities/contracts";
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
  type ItemOfType,
  StartedAtField,
  EventMarks,
  fromDatetimeLocalValue,
  itemsPatchedWith,
  toDatetimeLocalValue,
  useSubmitEventUpdate,
} from "./shared";

interface FoodItemDraft {
  key: string;
  id: string;
  name: string;
  isNew: boolean;
  portion: string;
  approximateWeightGrams: string;
  caloriesKcal: string;
  carbohydratesGrams: string;
  proteinsGrams: string;
  totalFatGrams: string;
  fiberGrams: string;
  /** O que a IA extraiu e o formulario nao edita — atravessa intacto. */
  micronutrients: Record<string, number>;
  sourceFoodId?: string;
  sourceFoodRevision?: number;
}

function newKey(): string {
  return crypto.randomUUID();
}

function draftFromFoodItem(foodItem: FoodItem): FoodItemDraft {
  return {
    key: newKey(),
    id: foodItem.id,
    name: foodItem.name,
    isNew: false,
    portion: foodItem.portion,
    approximateWeightGrams: String(foodItem.approximateWeightGrams),
    caloriesKcal: String(foodItem.caloriesKcal),
    carbohydratesGrams: String(foodItem.macronutrients.carbohydratesGrams),
    proteinsGrams: String(foodItem.macronutrients.proteinsGrams),
    totalFatGrams: String(foodItem.macronutrients.totalFatGrams),
    fiberGrams: String(foodItem.macronutrients.fiberGrams),
    micronutrients: foodItem.micronutrients,
    sourceFoodId: foodItem.sourceFoodId,
    sourceFoodRevision: foodItem.sourceFoodRevision,
  };
}

function newFoodItem(): FoodItemDraft {
  return {
    key: newKey(),
    id: newKey(),
    name: "",
    isNew: true,
    portion: "",
    approximateWeightGrams: "",
    caloriesKcal: "",
    carbohydratesGrams: "",
    proteinsGrams: "",
    totalFatGrams: "",
    fiberGrams: "",
    micronutrients: {},
  };
}

export function MealEditForm({
  event,
  item,
  onCancel,
  onClose,
  onUpdated,
}: EditEventFormProps<ItemOfType<"meal">>) {
  const [foodItems, setFoodItems] = useState<FoodItemDraft[]>(
    item.data.foodItems.map(draftFromFoodItem),
  );
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

  function updateFoodItem(key: string, patch: Partial<FoodItemDraft>) {
    setFoodItems((current) =>
      current.map((foodItem) => (foodItem.key === key ? { ...foodItem, ...patch } : foodItem)),
    );
  }

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();

    const builtFoodItems: FoodItem[] = foodItems.map((foodItem) => ({
      id: foodItem.id,
      name: foodItem.name.trim(),
      portion: foodItem.portion.trim(),
      approximateWeightGrams: Number(foodItem.approximateWeightGrams) || 0,
      caloriesKcal: Number(foodItem.caloriesKcal) || 0,
      macronutrients: {
        carbohydratesGrams: Number(foodItem.carbohydratesGrams) || 0,
        proteinsGrams: Number(foodItem.proteinsGrams) || 0,
        totalFatGrams: Number(foodItem.totalFatGrams) || 0,
        fiberGrams: Number(foodItem.fiberGrams) || 0,
      },
      micronutrients: foodItem.micronutrients,
      ...(foodItem.sourceFoodId ? { sourceFoodId: foodItem.sourceFoodId } : {}),
      ...(foodItem.sourceFoodRevision !== undefined
        ? { sourceFoodRevision: foodItem.sourceFoodRevision }
        : {}),
    }));

    void submit({
      expectedRevision: event.revision,
      // O nome e a descricao da refeicao vem do agente e nao se editam aqui —
      // atravessam iguais. Os totais tambem: a API os recalcula a partir dos
      // alimentos, e somar de novo no browser so criaria um segundo lugar onde
      // o arredondamento pode divergir.
      items: itemsPatchedWith(event, item.id, {
        ...item.data,
        foodItems: builtFoodItems,
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
        <span className={fieldLabelClass}>Itens da refeição</span>

        {foodItems.length === 0 ? (
          <p className={emptyRowClass}>Nenhum item nesta refeição.</p>
        ) : null}

        {foodItems.map((foodItem) => (
          <div
            key={foodItem.key}
            className="flex flex-col gap-2.5 rounded-lg border border-border p-3"
          >
            <div className="flex items-center gap-2">
              {foodItem.isNew ? (
                <input
                  type="text"
                  placeholder="Ex.: Arroz branco"
                  value={foodItem.name}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, { name: inputEvent.target.value })
                  }
                  className={cn(smallInputClass, "flex-1")}
                />
              ) : (
                <p
                  className="flex-1 truncate text-[13.5px] font-medium text-foreground"
                  title={foodItem.name}
                >
                  {foodItem.name}
                </p>
              )}
              <button
                type="button"
                onClick={() =>
                  setFoodItems((current) => current.filter((other) => other.key !== foodItem.key))
                }
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
                  value={foodItem.portion}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, { portion: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Peso (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={foodItem.approximateWeightGrams}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, {
                      approximateWeightGrams: inputEvent.target.value,
                    })
                  }
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Calorias</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={foodItem.caloriesKcal}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, { caloriesKcal: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Carboidratos (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={foodItem.carbohydratesGrams}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, { carbohydratesGrams: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Proteínas (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={foodItem.proteinsGrams}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, { proteinsGrams: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Gorduras (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={foodItem.totalFatGrams}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, { totalFatGrams: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] text-muted-foreground">Fibras (g)</label>
                <input
                  type="number"
                  min={0}
                  step={anyDecimalStep}
                  value={foodItem.fiberGrams}
                  onChange={(inputEvent) =>
                    updateFoodItem(foodItem.key, { fiberGrams: inputEvent.target.value })
                  }
                  className={smallInputClass}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setFoodItems((current) => [...current, newFoodItem()])}
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
