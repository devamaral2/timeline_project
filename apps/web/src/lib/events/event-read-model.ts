import type { TaskArtifactDto, TaskDto, TaskPriority, TaskRecurrenceDto, HumanTaskStatus } from "@repo/contracts";
import { dayKeyOf, formatTime, shortDate, weekday, zonedDayStart } from "@repo/timeline";
import type { EditEventInput } from "@/lib/api/events";
import { recurrenceRuleLabel } from "@/lib/events/card-text";

/**
 * O que a leitura do evento de pessoa mostra e o que a troca de status e de
 * prioridade manda à API. Funções puras: a tela passa o `now` e os testes
 * fixam o relógio.
 */

/** A ordem dos status no seletor, como no quadro Status do canvas. */
const HUMAN_STATUS_ORDER: readonly HumanTaskStatus[] = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"];

/** Os status que o seletor oferece. "Não realizado" é marca do evento comum: o evento longo nunca a recebe. */
export function humanStatusOptions(event: Pick<TaskDto, "longRunning">): HumanTaskStatus[] {
  return HUMAN_STATUS_ORDER.filter((status) => !(event.longRunning && status === "missed"));
}

/**
 * O `PATCH` que troca o status. Concluir envia `finishedAt` com o instante
 * atual, e tirar de `done` envia `finishedAt` nulo: a API não grava a conclusão
 * sozinha (ver api-rotas). A revisão é a que a tela leu.
 */
export function statusPatch(event: Pick<TaskDto, "revision" | "status">, status: HumanTaskStatus | null, now: Date): EditEventInput {
  const patch: EditEventInput = { expectedRevision: event.revision, status };
  if (status === "done") patch.finishedAt = now.toISOString();
  else if (event.status === "done") patch.finishedAt = null;
  return patch;
}

export function priorityPatch(event: Pick<TaskDto, "revision">, priority: TaskPriority): EditEventInput {
  return { expectedRevision: event.revision, priority };
}

const MINUTES_PER_DAY = 1440;

/** O lembrete em cartão pequeno: "30 min", "1 dia", "2 dias". Dia exato sai em dias. */
export function reminderLabel(minutes: number): string {
  if (minutes % MINUTES_PER_DAY === 0) {
    const days = minutes / MINUTES_PER_DAY;
    return `${days} ${days === 1 ? "dia" : "dias"}`;
  }
  return `${minutes} min`;
}

/**
 * Um instante no fuso da timeline: "Sáb, 14 nov · 18:30". Meia-noite local é
 * o dia sem hora, e sai só "Sáb, 14 nov".
 */
export function momentLabel(instant: string): string {
  const dayKey = dayKeyOf(instant);
  const day = `${weekday(dayKey).slice(0, 3)}, ${shortDate(dayKey).toLowerCase()}`;
  return isDayStart(instant) ? day : `${day} · ${formatTime(instant)}`;
}

/** A regra da série e, embaixo, desde quando vale, se tem fim e se a ocorrência ainda a segue. */
export function recurrenceLines(recurrence: TaskRecurrenceDto): { rule: string; detail: string } {
  const since = shortDate(recurrence.rule.startsOn).toLowerCase();
  const end = recurrence.rule.endsOn ? `até ${shortDate(recurrence.rule.endsOn).toLowerCase()}` : "sem fim";
  const follows = recurrence.detached ? "esta ocorrência não segue a série" : "esta ocorrência segue a série";
  return { rule: recurrenceRuleLabel(recurrence.rule), detail: `desde ${since} · ${end} · ${follows}` };
}

/**
 * O total de calorias da refeição: a soma de `totals.totalCaloriesKcal` dos alimentos ligados ao evento, cópias
 * incluídas. O que não é alimento não entra; sem alimento, zero.
 */
export function mealCaloriesKcal(links: readonly TaskArtifactDto[]): number {
  return links.reduce((sum, link) => (link.artifact.type === "food" ? sum + link.artifact.data.totals.totalCaloriesKcal : sum), 0);
}

function isDayStart(instant: string): boolean {
  return new Date(instant).getTime() === zonedDayStart(dayKeyOf(instant)).getTime();
}
