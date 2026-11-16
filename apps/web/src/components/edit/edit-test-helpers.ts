import { fireEvent, screen, within } from "@testing-library/react";
import { longDate } from "@repo/timeline";
import { MONTH_NAMES, monthOf } from "./calendar";

/**
 * Os testes de tela mexem nos campos como a pessoa: a lista de escolha, o calendário e as colunas de hora abrem por
 * clique e fecham ao escolher. Estes apoios abrem, escolhem e deixam a tela como estava, para o teste dizer só o valor.
 */

const exact = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);

/** O campo pelo rótulo: a lista de escolha, a data, a hora; qualquer outro é o campo comum de mesmo rótulo. */
export function getField(label: string): HTMLElement {
  return (
    screen.queryByRole("combobox", { name: exact(label) }) ??
    screen.queryByRole("button", { name: exact(label) }) ??
    screen.getByLabelText(label)
  );
}

/** O valor que o campo guarda: o da escolha, o `YYYY-MM-DD` da data, o `HH:MM` da hora; nos outros, o que está escrito. */
export function fieldValue(label: string): string {
  const element = getField(label);
  return element.dataset.value ?? (element as HTMLInputElement).value;
}

export function chooseValue(label: string, value: string) {
  fireEvent.click(getField(label));
  const listbox = screen.getByRole("listbox", { name: label });
  const option = listbox.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`);
  if (!option) throw new Error(`Sem a opção "${value}" em "${label}".`);
  fireEvent.click(option);
}

export function pickDate(label: string, dayKey: string) {
  fireEvent.click(getField(label));
  if (dayKey === "") {
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    return;
  }
  const target = monthOf(dayKey);
  const targetIndex = target.year * 12 + target.month;
  const dialog = screen.getByRole("dialog", { name: label });
  for (let guard = 0; guard < 48; guard += 1) {
    const shown = within(dialog).getByRole("group").getAttribute("aria-label") ?? "";
    const [name, , year] = shown.split(" ");
    const index = Number(year) * 12 + MONTH_NAMES.indexOf(name as (typeof MONTH_NAMES)[number]) + 1;
    if (index === targetIndex) break;
    fireEvent.click(within(dialog).getByRole("button", { name: index < targetIndex ? "Próximo mês" : "Mês anterior" }));
  }
  fireEvent.click(within(dialog).getByRole("button", { name: longDate(dayKey) }));
}

export function pickTime(label: string, time: string) {
  fireEvent.click(getField(label));
  if (time === "") {
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    return;
  }
  const [hour, minute] = time.split(":") as [string, string];
  fireEvent.click(within(screen.getByRole("listbox", { name: "Hora" })).getByRole("option", { name: hour }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Minuto" })).getByRole("option", { name: minute }));
}

/** Muda um campo como a pessoa mudaria: escolhe na lista, no calendário ou no relógio, ou escreve. */
export function setField(label: string, value: string) {
  const element = getField(label);
  if (element.getAttribute("role") === "combobox") {
    chooseValue(label, value);
  } else if (label.startsWith("Data") || label === "Termina em") {
    pickDate(label, value);
  } else if (label.startsWith("Hora")) {
    pickTime(label, value);
  } else {
    fireEvent.change(element, { target: { value } });
  }
}

