import { z } from "zod";
import type { DayContext } from "../day-context.query";
import { defineAgentSkill, fail } from "./agent-skill";

const MAX_CONTEXT_CHARS = 20_000;

export const getDayContextSkill = defineAgentSkill({
  name: "get_day_context",
  progressLabel: "Consultando o dia",
  description: "Busca todos os eventos de um dia, com pausas, tarefas e notas vinculadas (noteIds), sem escrever SQL.",
  instructions: [
    "get_day_context — informe o dia civil YYYY-MM-DD em America/Sao_Paulo.",
    "Se hasMore for true, chame novamente com page = nextPage até ler todas as páginas.",
    "Antes de criar ou alterar qualquer evento, consulte o dia afetado. Em eventos que atravessam",
    "a meia-noite, consulte também o dia adjacente. A resposta contém todos os eventos do dia,",
    "com ids e horários; não invente ids. Se retornar erro de volume, não grave o evento.",
  ].join("\n"),
  parameters: z.object({ date: z.iso.date(), page: z.number().int().positive().optional() }),
  run: async ({ date, page = 1 }, { session, dayContext, recurrences, loadedDays, dayPages }) => {
    if (!dayContext) return fail("Consulta diária indisponível.");
    if (!dayPages) return fail("Paginação diária indisponível.");
    let state = dayPages.get(date);
    if (!state) {
      if (page !== 1) return fail("Comece pela página 1.");
      await recurrences?.materialize(session.userId, new Date(`${date}T12:00:00.000Z`));
      const result = await dayContext.get({ userId: session.userId, date });
      const pages = paginateDay(result);
      if (!pages) return fail("Um registro deste dia excede o limite da ferramenta. Nada será gravado sem o contexto inteiro.");
      state = { pages, next: 1 };
      dayPages.set(date, state);
    }
    if (page > state.next || page > state.pages.length) return fail(`Consulte a página ${state.next} antes de continuar.`);
    const part = state.pages[page - 1];
    const hasMore = page < state.pages.length;
    if (page === state.next) state.next += 1;
    if (!hasMore && page < state.next) loadedDays?.set(date, {
      ...part,
      events: state.pages.flatMap((entry) => entry.events),
      tasks: state.pages.flatMap((entry) => entry.tasks),
      notes: state.pages.flatMap((entry) => entry.notes),
    });
    return { ok: true, ...part, page, pageCount: state.pages.length, hasMore, nextPage: hasMore ? page + 1 : null };
  },
});

function paginateDay(day: DayContext): DayContext[] | null {
  const empty = (): DayContext => ({ date: day.date, timeZone: day.timeZone, events: [], tasks: [], notes: [] });
  const pages = [empty()];
  const append = (push: (part: DayContext) => void, pop: (part: DayContext) => void): boolean => {
    let current = pages[pages.length - 1];
    push(current);
    if (JSON.stringify(current).length <= MAX_CONTEXT_CHARS) return true;
    pop(current);
    if (!current.events.length && !current.tasks.length && !current.notes.length) return false;
    current = empty();
    push(current);
    if (JSON.stringify(current).length > MAX_CONTEXT_CHARS) return false;
    pages.push(current);
    return true;
  };
  for (const item of day.events) if (!append((part) => { part.events.push(item); }, (part) => { part.events.pop(); })) return null;
  for (const item of day.tasks) if (!append((part) => { part.tasks.push(item); }, (part) => { part.tasks.pop(); })) return null;
  for (const item of day.notes) if (!append((part) => { part.notes.push(item); }, (part) => { part.notes.pop(); })) return null;
  return pages;
}
