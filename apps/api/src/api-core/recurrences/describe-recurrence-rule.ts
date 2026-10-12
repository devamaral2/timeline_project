import type { RecurrenceRule } from "@repo/contracts";

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

const ALL_DAYS = 0b111_1111;
const MONDAY_TO_FRIDAY = 0b011_1110;

function weekdaysOf(mask: number): string[] {
  return WEEKDAYS.filter((_, index) => (mask & (1 << index)) !== 0);
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function dayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-");
  return `${day}/${month}/${year}`;
}

function minutesLabel(total: number): string {
  if (total < 60) return `${total} min`;
  const rest = total % 60;
  return `${Math.floor(total / 60)} h${rest ? ` ${rest}` : ""}`;
}

function cadenceOf(rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case "daily":
      return rule.interval === 1 ? "todo dia" : `a cada ${rule.interval} dias`;

    case "weekly": {
      const mask = rule.byWeekday ?? 0;
      if (rule.interval === 1) {
        if (mask === ALL_DAYS) return "todo dia";
        if (mask === MONDAY_TO_FRIDAY) return "de segunda a sexta";
        const names = weekdaysOf(mask);
        const masculine = mask !== 0 && (mask & ~0b100_0001) === 0;
        return `${masculine ? "todo" : "toda"} ${list(names)}`;
      }
      return `a cada ${rule.interval} semanas, ${mask === MONDAY_TO_FRIDAY ? "de segunda a sexta" : `${list(weekdaysOf(mask))}`}`;
    }

    case "monthly":
      return rule.interval === 1
        ? `todo dia ${rule.byMonthDay} do mês`
        : `no dia ${rule.byMonthDay}, a cada ${rule.interval} meses`;

    case "yearly": {
      const date = `${rule.byMonthDay} de ${MONTHS[(rule.byMonth ?? 1) - 1]}`;
      return rule.interval === 1 ? `todo ano em ${date}` : `em ${date}, a cada ${rule.interval} anos`;
    }
  }
}

/** A regra em portugues, para a resposta do agente: "toda segunda e quarta às 07:00 por 1 h, a partir de 13/10/2026". */
export function describeRecurrenceRule(rule: RecurrenceRule): string {
  const parts = [`${cadenceOf(rule)} às ${rule.timeOfDay}`];
  if (rule.durationMinutes !== undefined) parts.push(`por ${minutesLabel(rule.durationMinutes)}`);
  const text = parts.join(" ");
  const bounds = [`a partir de ${dayLabel(rule.startsOn)}`];
  if (rule.endsOn) bounds.push(`até ${dayLabel(rule.endsOn)}`);
  return `${text}, ${bounds.join(" ")}`;
}
