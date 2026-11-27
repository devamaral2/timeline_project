/**
 * Fixtures do modo "Em sequência" e do tempo livre da agenda: as saídas de
 * `freeTimeSlots`, `freeWindowGrade`, `agendaTasksByDay` e da composição das
 * linhas do dia (`agendaRowsOf`, não exportada de `agenda-day.tsx`, repetida aqui
 * com as mesmas peças exportadas) para as entradas que importam, e as respostas
 * do servidor para as janelas que a rolagem infinita pede.
 */
import { agendaPageSchema, taskCardSchema } from "../../../packages/contracts/src/schemas";
import { dayKeyRange, shiftDayKey, zonedDayEnd, zonedDayStart } from "../../../packages/timeline/src/index";
import { agendaTaskFromCard, agendaTasksByDay, isAgendaCard } from "../../../apps/web/src/components/agenda/agenda-data";
import { spanForExample } from "../../../apps/web/src/components/agenda/agenda-timing";
import {
  freeTimeSlots, freeWindowGrade, MIN_FREE_WINDOW_MINUTES, type TimeSpan,
} from "../../../apps/web/src/components/agenda/free-time";
import { PERSONAL_PROJECT } from "./project";

type CardInput = Record<string, unknown> & { id: string; name: string };

function card(input: CardInput) {
  return taskCardSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    description: "",
    project: PERSONAL_PROJECT,
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...input,
  });
}

const at = (day: string, time: string) => `${day}T${time}:00.000-03:00`;
const iso = (day: string, time: string) => new Date(at(day, time)).toISOString();
const ms = (day: string, time: string) => new Date(at(day, time)).getTime();

const D = "2026-09-14";
const span = (start: string, end: string | null, day = D): TimeSpan => ({ startMs: ms(day, start), endMs: end === null ? null : ms(day, end) });

/** Os casos de `freeTimeSlots`: os testes do web e as bordas (dia de 23 h, lacunas de 14 e 15 min, meia-noite). */
const SLOT_CASES: { dayKey: string; spans: TimeSpan[] }[] = [
  { dayKey: D, spans: [span("13:00", "14:00"), span("20:00", "21:00")] },
  { dayKey: D, spans: [span("19:00", "21:00")] },
  { dayKey: D, spans: [span("07:00", "08:00"), span("08:00", "09:00"), span("09:00", "23:30"), span("23:00", "23:59")] },
  { dayKey: D, spans: [{ startMs: ms(D, "22:00"), endMs: ms("2026-09-15", "06:00") }] },
  { dayKey: D, spans: [span("09:00", "12:00"), span("10:00", "11:00"), span("13:00", "14:00")] },
  { dayKey: D, spans: [span("20:00", "21:00"), span("13:00", "14:00")] },
  { dayKey: D, spans: [span("07:00", "08:00"), span("09:00", null), span("12:00", "13:00")] },
  { dayKey: D, spans: [] },
  { dayKey: D, spans: [span("09:00", "10:00"), span("10:14", "11:00"), span("11:15", "12:00"), span("12:30", "12:30")] },
  { dayKey: D, spans: [span("09:00", "09:00"), span("09:00", "09:00"), span("23:59", "23:59")] },
  { dayKey: "2018-11-03", spans: [span("08:00", "09:00", "2018-11-03"), span("22:00", "23:30", "2018-11-03")] },
  { dayKey: "2018-11-04", spans: [span("08:00", "09:00", "2018-11-04")] },
  { dayKey: "2018-02-17", spans: [span("22:30", "23:00", "2018-02-17")] },
];

/** A régua de cor das janelas livres: antes, nos e depois dos pontos de virada (15 min, 2 h, 4 h). */
const GRADE_MINUTES = [1, 14, 15, 30, 60, 67, 120, 121, 180, 240, 241, 600, 1440];

const FREE_DAY = "2026-09-16";

/** Um dia com pessoa, agente, sobreposição, tarefa sem fim e lacunas abaixo e acima de 15 minutos. */
const FREE_CARDS = [
  card({ id: "free-1", name: "Primeira", startedAt: iso(FREE_DAY, "09:00"), estimatedFinishAt: iso(FREE_DAY, "10:00") }),
  card({ id: "free-2", name: "Dentro da primeira", startedAt: iso(FREE_DAY, "09:30"), estimatedFinishAt: iso(FREE_DAY, "09:45") }),
  card({ id: "free-3", name: "Agente no vão", actor: "agent", kind: "search_request", status: "running", startedAt: iso(FREE_DAY, "10:30"), estimatedFinishAt: iso(FREE_DAY, "11:30") }),
  card({ id: "free-4", name: "Sem hora de fim", startedAt: iso(FREE_DAY, "12:00") }),
  card({ id: "free-5", name: "Concluída antes do fim planejado", status: "done", startedAt: iso(FREE_DAY, "13:00"), estimatedFinishAt: iso(FREE_DAY, "14:00"), finishedAt: iso(FREE_DAY, "13:10") }),
  card({ id: "free-6", name: "Lacuna de 10 min", startedAt: iso(FREE_DAY, "14:10"), estimatedFinishAt: iso(FREE_DAY, "14:20") }),
  card({ id: "free-7", name: "Lacuna de 15 min", startedAt: iso(FREE_DAY, "14:35"), estimatedFinishAt: iso(FREE_DAY, "15:00") }),
  card({ id: "free-8", name: "Noite", startedAt: iso(FREE_DAY, "21:00"), estimatedFinishAt: iso(FREE_DAY, "23:50") }),
  card({ id: "free-9", name: "Passo da pesquisa", actor: "agent", kind: "step", status: "completed", startedAt: iso(FREE_DAY, "16:00") }),
  card({ id: "free-10", name: "Tarefa longa", longRunning: true, startedAt: iso("2026-09-01", "12:00"), estimatedFinishAt: iso("2026-11-30", "12:00") }),
];

/** Só tarefas de pessoa contam para o tempo livre; o fim é o planejado e, sem ele, o próprio início. */
function agendaRows(cards: ReturnType<typeof card>[], dayKey: string, showFreeTime: boolean) {
  const tasks = (agendaTasksByDay(cards)[dayKey] ?? []);
  const spans = tasks.map((task) => spanForExample(task, dayKey));
  const personSpans = tasks.filter((task) => task.card?.actor !== "agent").map((task) => spanForExample(task, dayKey));
  const slots = showFreeTime ? freeTimeSlots(personSpans, dayKey).filter((slot) => slot.minutes >= MIN_FREE_WINDOW_MINUTES) : [];
  const rows = [
    ...tasks.map((task, index) => ({ kind: "task" as const, id: task.id as string, startMs: spans[index].startMs })),
    ...slots.map((slot) => ({
      kind: "free" as const, startMs: slot.startMs, endMs: slot.endMs, minutes: slot.minutes, endsAtMidnight: slot.endsAtMidnight,
    })),
  ];
  return rows.sort((left, right) => left.startMs - right.startMs);
}

/** Os cartões que o servidor devolve para uma janela de dias: os que têm o início dentro dela. */
function serverWindow(pool: ReturnType<typeof card>[], firstDay: string, lastDay: string) {
  const from = zonedDayStart(firstDay).getTime();
  const to = zonedDayEnd(lastDay).getTime();
  const items = pool.filter((item) => item.startedAt && Date.parse(item.startedAt) >= from && Date.parse(item.startedAt) <= to);
  return { items };
}

/**
 * O que a rolagem infinita lê. As tarefas de 21 para 22 e de 13 para 14 de setembro cruzam a meia-noite
 * nas bordas das janelas; as de 28 e de 7 caem justo na borda das janelas maiores.
 */
const POOL = [
  card({ id: "seq-0", name: "Antes de 7", startedAt: iso("2026-09-06", "10:00"), estimatedFinishAt: iso("2026-09-06", "11:00") }),
  card({ id: "seq-1", name: "Dia 7", startedAt: iso("2026-09-07", "08:00"), estimatedFinishAt: iso("2026-09-07", "09:00") }),
  card({ id: "seq-2", name: "Dia 10", startedAt: iso("2026-09-10", "15:00"), estimatedFinishAt: iso("2026-09-10", "16:00") }),
  card({ id: "seq-3", name: "Atravessa o 13", startedAt: iso("2026-09-13", "23:00"), estimatedFinishAt: iso("2026-09-14", "01:00") }),
  card({ id: "seq-4", name: "Dia 14 cedo", startedAt: iso("2026-09-14", "07:00"), estimatedFinishAt: iso("2026-09-14", "08:00") }),
  card({ id: "seq-5", name: "Agente no 14", actor: "agent", kind: "build_request", status: "queued", startedAt: iso("2026-09-14", "09:00") }),
  card({ id: "seq-6", name: "Dia 16", startedAt: iso("2026-09-16", "12:00"), estimatedFinishAt: iso("2026-09-16", "13:00") }),
  card({ id: "seq-7", name: "Dia 21 tarde", startedAt: iso("2026-09-21", "16:00"), estimatedFinishAt: iso("2026-09-21", "17:00") }),
  card({ id: "seq-8", name: "Atravessa o 21", startedAt: iso("2026-09-21", "23:00"), estimatedFinishAt: iso("2026-09-22", "01:00") }),
  card({ id: "seq-9", name: "Dia 22", startedAt: iso("2026-09-22", "09:00"), estimatedFinishAt: iso("2026-09-22", "10:00") }),
  card({ id: "seq-10", name: "Dia 28 noite", startedAt: iso("2026-09-28", "22:00"), estimatedFinishAt: iso("2026-09-28", "23:00") }),
  card({ id: "seq-11", name: "Dia 29", startedAt: iso("2026-09-29", "10:00"), estimatedFinishAt: iso("2026-09-29", "11:00") }),
  card({ id: "seq-12", name: "Projeto longo", longRunning: true, startedAt: iso("2026-09-14", "12:00"), estimatedFinishAt: iso("2026-11-30", "12:00") }),
];

const SEQUENCE_START = "2026-09-14";

function windowOf(before: number, after: number) {
  const days = dayKeyRange(shiftDayKey(SEQUENCE_START, -before), before + after + 1);
  const first = days[0] as string;
  const last = days[days.length - 1] as string;
  const response = serverWindow(POOL, first, last);
  const byDay = agendaTasksByDay(response.items);
  return {
    before,
    after,
    days,
    from: zonedDayStart(first).toISOString(),
    to: zonedDayEnd(last).toISOString(),
    response: agendaPageSchema.parse(response),
    /** O que a agenda guarda em cada dia da janela (todo dia tem chave, mesmo vazio), em ids, pelas regras do web. */
    idsByDay: Object.fromEntries(days.map((day) => [day, (byDay[day] ?? []).map((task) => task.id)])),
  };
}

export function agendaFixtures(): Record<string, unknown> {
  return {
    "agenda-free-time": {
      minimumMinutes: MIN_FREE_WINDOW_MINUTES,
      slots: SLOT_CASES.map(({ dayKey, spans }) => ({ args: [spans, dayKey], result: freeTimeSlots(spans, dayKey) })),
      grades: GRADE_MINUTES.map((minutes) => ({ args: [minutes], result: freeWindowGrade(minutes) })),
      day: FREE_DAY,
      page: agendaPageSchema.parse({ items: FREE_CARDS }),
      agendaCardIds: FREE_CARDS.filter(isAgendaCard).map((item) => item.id),
      rowsWithFreeTime: agendaRows(FREE_CARDS, FREE_DAY, true),
      rowsWithoutFreeTime: agendaRows(FREE_CARDS, FREE_DAY, false),
    },
    "agenda-sequence": {
      anchor: SEQUENCE_START,
      stepDays: 7,
      maxDays: 364,
      windows: [windowOf(0, 7), windowOf(0, 14), windowOf(7, 7), windowOf(7, 14), windowOf(14, 7)],
      /** O primeiro dia e o último de uma janela que chegou a 364 dias para cada lado. */
      cap: {
        firstFrom: zonedDayStart(shiftDayKey(SEQUENCE_START, -364)).toISOString(),
        lastTo: zonedDayEnd(shiftDayKey(SEQUENCE_START, 364)).toISOString(),
      },
    },
  };
}
