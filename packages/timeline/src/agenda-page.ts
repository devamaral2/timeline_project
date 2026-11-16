import type { AgendaPageDto, TaskCardDto } from "@repo/contracts";

/** As tarefas ja carregadas de um dia e o cursor da proxima pagina, se houver. */
export interface AgendaPageState {
  items: TaskCardDto[];
  nextCursor?: string;
}

/**
 * Junta uma pagina recem-chegada ao que ja estava na tela.
 *
 * A deduplicacao por id nao e zelo excessivo: entre uma pagina e a seguinte o
 * usuario pode criar uma tarefa, e o cursor — que aponta para uma posicao na
 * ordem `(startedAt, id)` — devolveria o mesmo cartao duas vezes. Sem cursor na
 * resposta, acabou a lista: e por isso que `nextCursor` some em vez de virar
 * string vazia.
 */
export function mergeAgendaPage(
  current: readonly TaskCardDto[],
  page: AgendaPageDto,
): AgendaPageState {
  const merged = [...current];
  const seen = new Set(current.map((task) => task.id));

  for (const task of page.items) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    merged.push(task);
  }

  return { items: merged, nextCursor: page.nextCursor };
}
