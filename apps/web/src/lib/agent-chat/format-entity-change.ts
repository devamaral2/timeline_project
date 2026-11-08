import type { AgentChatFieldChange } from "@/lib/api/contracts";

const LOCALE = "pt-BR";

/** O nome do campo na primeira coluna do diff; o horario fica sem nome, como o `ter 15 set` do desenho. */
export const FIELD_LABELS: Record<AgentChatFieldChange["field"], string> = {
  time: "",
  deadline: "prazo",
  name: "nome",
  description: "descrição",
  status: "estado",
  priority: "prioridade",
  tags: "tags",
};

/** `ter 15 set` (o ponto que o Intl poe nas abreviacoes sai). */
function dayLabel(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone }).formatToParts(date);
  const pick = (type: string) => (parts.find((part) => part.type === type)?.value ?? "").replace(/\.$/, "");
  return `${pick("weekday")} ${pick("day")} ${pick("month")}`;
}

function clock(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);
}

/** `ter 15 set 07:00 — 07:45`; o fim em outro dia leva o dia dele. */
function formatInterval(value: string, timeZone?: string): string {
  const [from, to] = value.split("/");
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return value;
  const head = `${dayLabel(start, timeZone)} ${clock(start, timeZone)}`;
  if (!to) return head;
  const end = new Date(to);
  if (Number.isNaN(end.getTime())) return head;
  const sameDay = dayLabel(start, timeZone) === dayLabel(end, timeZone);
  return `${head} — ${sameDay ? "" : `${dayLabel(end, timeZone)} `}${clock(end, timeZone)}`;
}

/** O valor de um lado do diff, pronto para exibir. */
export function formatChangeValue(field: AgentChatFieldChange["field"], value: string, timeZone?: string): string {
  if (field === "time") return formatInterval(value, timeZone);
  if (field === "deadline") return formatInterval(value, timeZone);
  return value;
}

export interface ChangeLine {
  sign: "-" | "+";
  label: string;
  value: string;
}

/** As linhas do diff: o que saiu (`-`) e depois o que entrou (`+`), campo a campo. */
export function changeLines(changes: readonly AgentChatFieldChange[], timeZone?: string): ChangeLine[] {
  return changes.flatMap((change) => {
    const label = FIELD_LABELS[change.field];
    const lines: ChangeLine[] = [];
    if (change.before !== undefined) lines.push({ sign: "-", label, value: formatChangeValue(change.field, change.before, timeZone) });
    if (change.after !== undefined) lines.push({ sign: "+", label, value: formatChangeValue(change.field, change.after, timeZone) });
    return lines;
  });
}
