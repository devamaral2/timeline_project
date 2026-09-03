import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { EventDetailDto, EventItemDto } from "@repo/entities/contracts";
import { MealEditForm } from "./MealEditForm";
import { SleepEditForm } from "./SleepEditForm";
import { TrainingEditForm } from "./TrainingEditForm";

vi.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: null }) }));
vi.mock("@/lib/firebase/client-app", () => ({ getClientApp: () => ({}) }));

/**
 * Regressao: com o `step` padrao (1) do <input type="number">, qualquer decimal
 * — inclusive os que ja vinham salvos no evento — fica com stepMismatch e o
 * navegador recusa o submit do form inteiro.
 */

const common = {
  id: "event-1",
  name: "Evento",
  description: "",
  startedAt: "2026-08-19T09:00:00.000Z",
  finishedAt: "2026-08-19T10:00:00.000Z",
  tags: [],
  missed: false,
  priority: "normal" as const,
  interruptions: [],
  revision: 3,
};

/** Um evento de um item so — o item e o principal, e e ele que o form edita. */
function anEventWith(item: EventItemDto): EventDetailDto {
  return { ...common, primaryItemId: item.id, items: [item] };
}

function anItem<TType extends EventItemDto["type"]>(
  type: TType,
  data: Extract<EventItemDto, { type: TType }>["data"],
): Extract<EventItemDto, { type: TType }> {
  return {
    id: `${type}-item`,
    position: 0,
    type,
    schemaVersion: 1,
    isPrimary: true,
    data,
  } as Extract<EventItemDto, { type: TType }>;
}

const props = { onCancel: () => {}, onClose: () => {}, onUpdated: () => {} };

function numberInputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="number"]')];
}

function invalidValues(container: HTMLElement): string[] {
  return numberInputs(container)
    .filter((input) => !input.checkValidity())
    .map((input) => input.value);
}

/**
 * Regressao: com `value` indefinido o <select> vira nao-controlado e o submit
 * manda a primeira opcao da lista — foi assim que um evento mudou de prioridade
 * sozinho ao ser editado contra um backend que ainda nao mandava o campo.
 */
test("um evento sem prioridade nao assume a primeira opcao do select", () => {
  const item = anItem("sleep", { trackedSleepTime: 400, score: 80 });
  const { container } = render(
    <SleepEditForm
      {...props}
      event={{
        ...anEventWith(item),
        missed: undefined as never,
        priority: undefined as never,
      }}
      item={item}
    />,
  );

  const prioridade = container.querySelector<HTMLSelectElement>("#event-priority");
  const naoRealizado = container.querySelector<HTMLInputElement>("#event-missed");

  expect(prioridade?.value).toBe("");
  expect(prioridade?.options[0].textContent).toBe("Não definida");
  // A caixa nao tem esse problema: sem valor ela so fica desmarcada, que e
  // exatamente o que um evento sem anotacao e.
  expect(naoRealizado?.checked).toBe(false);
});

test("treino com decimais salvos abre com todos os campos numericos validos", () => {
  const item = anItem("training", {
    caloriesBurned: 500.9,
    workouts: [
      {
        id: "w-1",
        workoutCode: "running",
        workoutName: "Corrida",
        calories: 320.5,
        duration: 42.5,
        pace: 5.27,
        distance: 8.12,
      },
      {
        id: "w-2",
        workoutCode: "weightlifting",
        workoutName: "Musculação",
        calories: 180.4,
        duration: 30.5,
        sets: [{ id: "s-1", exercise: "Supino", repetitions: 10, weight: 22.5 }],
      },
    ],
  });
  const { container } = render(
    <TrainingEditForm {...props} event={anEventWith(item)} item={item} />,
  );

  expect(invalidValues(container)).toEqual([]);
});

test("treino aceita decimal digitado em qualquer campo numerico", () => {
  const item = anItem("training", {
    caloriesBurned: 100,
    workouts: [
      {
        id: "w-1",
        workoutCode: "weightlifting",
        workoutName: "Musculação",
        calories: 100,
        duration: 30,
        sets: [{ id: "s-1", exercise: "Agachamento", repetitions: 8, weight: 60 }],
      },
    ],
  });
  const { container } = render(
    <TrainingEditForm {...props} event={anEventWith(item)} item={item} />,
  );

  for (const input of numberInputs(container)) {
    fireEvent.change(input, { target: { value: "12.75" } });
  }

  expect(invalidValues(container)).toEqual([]);
});

test("sono com horas fracionadas fora do passo de 0,5 continua valido", () => {
  const item = anItem("sleep", { trackedSleepTime: 7.3, score: 82.5 });
  const { container } = render(
    <SleepEditForm {...props} event={anEventWith(item)} item={item} />,
  );

  expect(invalidValues(container)).toEqual([]);
});

test("refeicao com gramas e calorias decimais continua valida", () => {
  const item = anItem("meal", {
    name: "Almoço",
    description: "Arroz",
    foodItems: [
      {
        id: "i-1",
        name: "Arroz",
        portion: "1 xicara",
        approximateWeightGrams: 158.4,
        caloriesKcal: 205.6,
        macronutrients: {
          carbohydratesGrams: 44.5,
          proteinsGrams: 4.25,
          totalFatGrams: 0.44,
          fiberGrams: 0.63,
        },
        micronutrients: {},
      },
    ],
    totals: {
      totalCaloriesKcal: 205.6,
      totalProteinGrams: 4.25,
      totalCarbohydrateGrams: 44.5,
      totalFatGrams: 0.44,
      totalFiberGrams: 0.63,
    },
  });
  const { container } = render(
    <MealEditForm {...props} event={anEventWith(item)} item={item} />,
  );

  expect(invalidValues(container)).toEqual([]);
});

test("o form de treino nao bloqueia o submit por causa dos decimais", () => {
  const item = anItem("training", {
    caloriesBurned: 250.5,
    workouts: [
      {
        id: "w-1",
        workoutCode: "treadmill",
        workoutName: "Esteira",
        calories: 250.5,
        duration: 35.5,
        pace: 6.4,
        distance: 5.55,
      },
    ],
  });
  const { container } = render(
    <TrainingEditForm {...props} event={anEventWith(item)} item={item} />,
  );

  const form = container.querySelector("form");
  expect(form?.checkValidity()).toBe(true);
  expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
});
