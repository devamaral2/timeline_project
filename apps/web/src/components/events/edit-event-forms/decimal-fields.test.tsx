import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { EventDetailDto } from "@repo/entities/contracts";
import { FoodEditForm } from "./FoodEditForm";
import { SleepEditForm } from "./SleepEditForm";
import { TrainingEditForm } from "./TrainingEditForm";

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
};

/**
 * Regressao: com `value` indefinido o <select> vira nao-controlado e o submit
 * manda a primeira opcao da lista — foi assim que um evento mudou de prioridade
 * sozinho ao ser editado contra um backend que ainda nao mandava o campo.
 */
test("um evento sem prioridade nao assume a primeira opcao do select", () => {
  const { container } = renderForm({
    ...common,
    missed: undefined as never,
    priority: undefined as never,
    type: "sleep",
    data: { trackedSleepTime: 400, score: 80 },
  });

  const prioridade = container.querySelector<HTMLSelectElement>("#event-priority");
  const naoRealizado = container.querySelector<HTMLInputElement>("#event-missed");

  expect(prioridade?.value).toBe("");
  expect(prioridade?.options[0].textContent).toBe("Não definida");
  // A caixa nao tem esse problema: sem valor ela so fica desmarcada, que e
  // exatamente o que um evento sem anotacao e.
  expect(naoRealizado?.checked).toBe(false);
});

function numberInputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="number"]')];
}

function invalidValues(container: HTMLElement): string[] {
  return numberInputs(container)
    .filter((input) => !input.checkValidity())
    .map((input) => input.value);
}

function renderForm(event: EventDetailDto) {
  const props = { eventId: event.id, onCancel: () => {}, onClose: () => {}, onUpdated: () => {} };

  if (event.type === "training") return render(<TrainingEditForm {...props} event={event} />);
  if (event.type === "sleep") return render(<SleepEditForm {...props} event={event} />);
  if (event.type === "food") return render(<FoodEditForm {...props} event={event} />);
  throw new Error(`Sem formulario de edicao para ${event.type}`);
}

test("treino com decimais salvos abre com todos os campos numericos validos", () => {
  const { container } = renderForm({
    ...common,
    type: "training",
    data: {
      workouts: [
        { id: "w-1", type: "running", calories: 320.5, duration: 42.5, pace: 5.27, distance: 8.12 },
        {
          id: "w-2",
          type: "weightlifting",
          calories: 180.4,
          duration: 30.5,
          sets: [{ id: "s-1", exercise: "Supino", repetitions: 10, weight: 22.5 }],
        },
      ],
    },
  });

  expect(invalidValues(container)).toEqual([]);
});

test("treino aceita decimal digitado em qualquer campo numerico", () => {
  const { container } = renderForm({
    ...common,
    type: "training",
    data: {
      workouts: [
        {
          id: "w-1",
          type: "weightlifting",
          calories: 100,
          duration: 30,
          sets: [{ id: "s-1", exercise: "Agachamento", repetitions: 8, weight: 60 }],
        },
      ],
    },
  });

  for (const input of numberInputs(container)) {
    fireEvent.change(input, { target: { value: "12.75" } });
  }

  expect(invalidValues(container)).toEqual([]);
});

test("sono com horas fracionadas fora do passo de 0,5 continua valido", () => {
  const { container } = renderForm({
    ...common,
    type: "sleep",
    data: { trackedSleepTime: 7.3, score: 82.5 },
  });

  expect(invalidValues(container)).toEqual([]);
});

test("alimentacao com gramas e calorias decimais continua valida", () => {
  const { container } = renderForm({
    ...common,
    type: "food",
    data: {
      items: [
        {
          id: "i-1",
          food: "Arroz",
          portion: "1 xicara",
          approximateWeightGrams: 158.4,
          caloriesKcal: 205.6,
          macronutrients: {
            carbohydratesGrams: 44.5,
            proteinsGrams: 4.25,
            totalFatGrams: 0.44,
            fiberGrams: 0.63,
          },
          mainMicronutrients: {},
          otherData: {},
        },
      ],
    },
  });

  expect(invalidValues(container)).toEqual([]);
});

test("o form de treino nao bloqueia o submit por causa dos decimais", () => {
  const { container } = renderForm({
    ...common,
    type: "training",
    data: {
      workouts: [{ id: "w-1", type: "treadmill", calories: 250.5, duration: 35.5, pace: 6.4, distance: 5.55 }],
    },
  });

  const form = container.querySelector("form");
  expect(form?.checkValidity()).toBe(true);
  expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
});
