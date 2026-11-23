import type { AgentChangeSession } from "../agent/services/agent-change-session";
import { TIME_ZONE } from "../agent/time";
import type { PlaceResolver } from "../tasks/services/place-resolver.service";
import type { ArtifactEdit, NewArtifact, NewSeries, NewTask, SeriesEdit, TaskEdit } from "./request-agent-schemas";
import { changesNothing, planSeriesEdit, RuleError, seriesInput } from "./request-recurrence";
import { StepFailure, validInstant } from "./request-step-common";
import type { LinkRecord } from "./request-store";

/**
 * O que um agente de escrita devolve, preparado na sessao de mudancas do passo: nada e gravado aqui. Quem usa e o
 * agente unico de escrita do chat e a edicao de um alvo pela tela de detalhe. Uma mudanca que a sessao recusa
 * derruba o passo com `rejected`, sem gravar nada.
 */

/** Troca o lugar dito pelo endereco de um lugar que existe. Sem ele, o local fica como foi dito. */
export type Places = Pick<PlaceResolver, "resolve"> | undefined;

/** O artefato pertence a tarefa: a direcao em que o pedido mostra a ligacao. */
export function linkOf(artifactId: string, taskId: string): LinkRecord {
  return { from: { kind: "artifact", id: artifactId }, to: { kind: "task", id: taskId } };
}

const date = (value: string | null): Date | undefined => {
  const valid = validInstant(value);
  return valid ? new Date(valid) : undefined;
};

/** Um fim antes do inicio faria a entidade recusar a tarefa: melhor nascer sem fim, e o servidor estima um. */
function endsBeforeStart(startedAt: string | undefined, estimatedFinishAt: string | undefined): boolean {
  return startedAt !== undefined && estimatedFinishAt !== undefined
    && new Date(estimatedFinishAt).getTime() < new Date(startedAt).getTime();
}

const resolved = async (places: Places, said: string): Promise<string> => (await places?.resolve(said)) ?? said;

/**
 * As tarefas novas, na ordem dada. Toda refeicao nasce com o alimento dela, ja ligado, no mesmo lote: com o nome e
 * os alimentos ditos ou, sem eles, o nome da refeicao. O lugar dito e procurado no mapa; sem lugar dito, a tarefa
 * nasce sem local. Devolve o id de cada tarefa, na ordem da lista, e os alimentos ligados as refeicoes.
 */
export async function stageNewTasks(
  session: AgentChangeSession, tasks: readonly NewTask[], places: Places,
): Promise<{ ids: string[]; links: LinkRecord[] }> {
  const ids: string[] = [];
  const links: LinkRecord[] = [];
  for (const item of tasks) {
    const said = item.location?.trim();
    const location = said ? await resolved(places, said) : undefined;
    const before = new Set(session.result().created.filter((entry) => entry.kind === "artifact").map((entry) => entry.id));
    const startedAt = validInstant(item.startedAt);
    const estimatedFinishAt = validInstant(item.estimatedFinishAt);
    const result = await session.createTask({
      name: item.name,
      kind: item.kind,
      status: item.status ?? undefined,
      priority: item.priority ?? undefined,
      longRunning: item.longRunning ?? undefined,
      startedAt,
      estimatedFinishAt: endsBeforeStart(startedAt, estimatedFinishAt) ? undefined : estimatedFinishAt,
      description: item.description ?? undefined,
      tags: item.tags,
      ...(location ? { location } : {}),
      ...(item.kind === "meal" ? { artifacts: [{
        type: "food" as const,
        // O alimento leva o nome do que foi comido; sem ele dito, o da refeicao.
        name: item.foodName?.trim() || item.name,
        data: { inputText: item.foods?.trim() ?? "" },
      }] } : {}),
    }, { derivedArtifacts: false });
    if (!result.ok) throw new StepFailure("rejected");
    ids.push(result.id);
    for (const entry of session.result().created) {
      if (entry.kind === "artifact" && !before.has(entry.id)) links.push(linkOf(entry.id, result.id));
    }
  }

  // A hierarquia entre as tarefas da propria lista: a posicao que o agente deu vira o id recem-criado.
  for (const [index, item] of tasks.entries()) {
    if (item.subtaskOf === null) continue;
    const parent = ids[item.subtaskOf];
    const subtask = ids[index];
    if (!parent || !subtask || parent === subtask) throw new StepFailure("rejected");
    const result = await session.addSubtask(parent, subtask);
    if (!result.ok) throw new StepFailure("rejected");
  }
  return { ids, links };
}

/**
 * Os artefatos de texto novos. Quem diz onde cada um aparece e o agente: numa tarefa nova da mesma resposta (pela
 * posicao dela), numa tarefa que ja existe (pelo id, que precisa estar entre os permitidos), ou em nenhuma.
 */
export async function stageNewArtifacts(
  session: AgentChangeSession,
  artifacts: readonly NewArtifact[],
  newTaskIds: readonly string[],
  allowedTaskIds: ReadonlySet<string>,
): Promise<LinkRecord[]> {
  const links: LinkRecord[] = [];
  for (const item of artifacts) {
    const created = await session.createArtifact({ name: item.name, content: item.content });
    if (!created.ok) throw new StepFailure("rejected");
    if (item.taskIndex === null && item.taskId === null) continue;
    if (item.taskIndex !== null && item.taskId !== null) throw new StepFailure("rejected");
    const taskId = item.taskIndex !== null ? newTaskIds[item.taskIndex] : item.taskId;
    if (!taskId) throw new StepFailure("rejected");
    if (item.taskId !== null && !allowedTaskIds.has(item.taskId)) throw new StepFailure("target_unknown");
    const linked = await session.linkArtifact(created.id, taskId, "creates");
    if (!linked.ok) throw new StepFailure("rejected");
    links.push(linkOf(created.id, taskId));
  }
  return links;
}

/**
 * Cada serie nova entra com a primeira ocorrencia no mesmo lote (e uma linha de verdade, que o pedido mostra). O
 * template nao traz artefatos, nem o alimento de uma refeicao. O lugar dito e procurado no mapa, e toda ocorrencia
 * nasce com ele; sem lugar dito, a serie fica sem local.
 */
export async function stageNewSeries(session: AgentChangeSession, series: readonly NewSeries[], places: Places): Promise<void> {
  const today = session.todayIn(TIME_ZONE);
  for (const item of series) {
    const said = item.location?.trim();
    const location = said ? await resolved(places, said) : null;
    let input: ReturnType<typeof seriesInput>;
    try {
      input = seriesInput({ ...item, location }, today, TIME_ZONE);
    } catch (error) {
      if (error instanceof RuleError) throw new StepFailure("rejected");
      throw error;
    }
    const result = await session.createRecurrence(input, { derivedArtifacts: false });
    if (!result.ok) throw new StepFailure("rejected");
  }
}

/**
 * O lugar novo e procurado no mapa; `""` tira o local. As subtarefas novas nascem no mesmo lote, a fazer quando o
 * agente nao deu status, e entram sob a tarefa editada, depois das que ela ja tinha.
 */
export async function applyTaskEdits(session: AgentChangeSession, edits: readonly TaskEdit[], places: Places): Promise<void> {
  for (const edit of edits) {
    const said = edit.location?.trim();
    const location = said ? await resolved(places, said) : said;
    const changes = {
      name: edit.name ?? undefined, kind: edit.kind ?? undefined, status: edit.status ?? undefined,
      priority: edit.priority ?? undefined, description: edit.description ?? undefined, tags: edit.tags ?? undefined,
      startedAt: date(edit.startedAt), estimatedFinishAt: date(edit.estimatedFinishAt), finishedAt: date(edit.finishedAt),
      location,
    };
    if (Object.values(changes).some((value) => value !== undefined)) {
      const result = await session.reviseTask(edit.id, (current) => current.revise(changes));
      if (!result.ok) throw new StepFailure("rejected");
    }
    for (const subtask of edit.subtasks) {
      const created = await session.createTask({
        name: subtask.name,
        kind: "common",
        status: subtask.status ?? "todo",
        priority: subtask.priority ?? undefined,
        startedAt: validInstant(subtask.startedAt),
        estimatedFinishAt: validInstant(subtask.estimatedFinishAt),
        description: subtask.description ?? undefined,
      }, { derivedArtifacts: false });
      if (!created.ok) throw new StepFailure("rejected");
      const linked = await session.addSubtask(edit.id, created.id);
      if (!linked.ok) throw new StepFailure("rejected");
    }
  }
}

export async function applyArtifactEdits(session: AgentChangeSession, edits: readonly ArtifactEdit[]): Promise<void> {
  for (const edit of edits) {
    const changes = { name: edit.name ?? undefined, content: edit.content ?? undefined, tags: edit.tags ?? undefined };
    if (Object.values(changes).every((value) => value === undefined)) continue;
    const result = await session.updateArtifact(edit.id, changes);
    if (!result.ok) throw new StepFailure("rejected");
  }
}

/**
 * A serie e alterada de hoje em diante: as ocorrencias futuras que ninguem mexeu a mao saem e a primeira da regra
 * nova entra neste lote. O template nunca traz artefatos novos; os da serie ficam. O lugar novo e procurado no
 * mapa; `""` tira o local.
 */
export async function applySeriesEdits(session: AgentChangeSession, edits: readonly SeriesEdit[], places: Places): Promise<void> {
  for (const asked of edits) {
    if (changesNothing(asked)) continue;
    const said = asked.location?.trim();
    const edit = said ? { ...asked, location: await resolved(places, said) } : asked;
    const result = await session.updateRecurrence(
      edit.id,
      (current) => {
        try {
          return planSeriesEdit(current, edit, TIME_ZONE);
        } catch (error) {
          if (error instanceof RuleError) throw new Error(error.message);
          throw error;
        }
      },
      { derivedArtifacts: false },
    );
    if (!result.ok) throw new StepFailure("rejected");
  }
}
