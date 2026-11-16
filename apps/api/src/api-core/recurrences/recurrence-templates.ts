import {
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
  RecurrenceValidationError,
  type Artifact,
  type TaskPriority,
  type HumanTaskKind,
  type HumanTaskStatus,
  type OccurrenceLink,
  type Recurrence,
  type RecurrenceRule,
} from "../../domain";
import type { RecurrenceTemplate } from "@repo/contracts";
import type { TaskRepository } from "../../domain/ports";
import { dayKeyOf, expandOccurrences, occurrenceWindow, shiftDayKey } from "@repo/timeline";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateTaskUseCase, PrepareTaskOptions } from "../tasks/create-task.usecase";

/** O que cada ocorrencia copia, ja resolvido. E o que a serie guarda em `template`. */
export interface StoredTemplate {
  kind: HumanTaskKind;
  /** Ausente, cada ocorrencia nasce de referencia. */
  status?: HumanTaskStatus;
  name: string;
  description: string;
  /** Onde cada ocorrencia acontece. */
  location: string;
  tags: string[];
  priority: TaskPriority;
  notifyOffsetsMinutes: number[];
  /** Os mesmos artefatos em todas as ocorrencias, na ordem; cada uma ganha a propria relacao com eles. */
  artifactIds: string[];
  /** As tarefas maiores de que cada ocorrencia nasce subtarefa. */
  previousTaskIds: string[];
}

export interface PreparedTemplate {
  template: StoredTemplate;
  /** Os artefatos que o template cria, gravados junto com a serie. */
  artifacts: Artifact[];
  derivations: { originalId: string; copyId: string }[];
}

/** Ate onde uma serie nova olha para achar um dia de ensaio. */
const SAMPLE_SEARCH_DAYS = 366 * 4;

/**
 * O primeiro dia em que a regra cai, para montar uma ocorrencia de ensaio.
 * Uma regra que nao cai em dia nenhum (dia 31 de uma serie que termina em
 * abril, por exemplo) nao gera nada, e e melhor recusar do que salvar um
 * fantasma.
 */
export function sampleDayOf(rule: RecurrenceRule): string {
  const [first] = expandOccurrences(rule, rule.startsOn, shiftDayKey(rule.startsOn, SAMPLE_SEARCH_DAYS));
  if (!first) throw new RecurrenceValidationError("The recurrence never happens");
  return first;
}

export function storedTemplateOf(recurrence: Recurrence): StoredTemplate {
  const template = recurrence.template as Partial<StoredTemplate>;
  return {
    kind: template.kind ?? "common",
    status: template.status,
    name: template.name ?? "",
    description: template.description ?? "",
    location: template.location ?? "",
    tags: template.tags ?? [],
    priority: template.priority ?? "medium",
    notifyOffsetsMinutes: template.notifyOffsetsMinutes ?? [],
    artifactIds: template.artifactIds ?? [],
    previousTaskIds: template.previousTaskIds ?? [],
  };
}

/**
 * Resolve o template uma vez, com a janela da primeira ocorrencia: o nome
 * derivado ("Almoco") sai da hora da regra, os artefatos novos viram ids, e se
 * o template nao gera uma tarefa valida a serie nao e salva.
 */
export async function prepareTemplate(
  deps: { createTask: Pick<CreateTaskUseCase, "prepare">; tasks: Pick<TaskRepository, "findByIds"> },
  template: RecurrenceTemplate,
  rule: RecurrenceRule,
  actor: AuthenticatedUser,
  options?: PrepareTaskOptions,
): Promise<PreparedTemplate> {
  if (typeof template !== "object" || template === null) {
    throw new RecurrenceValidationError("A recurrence template must be an object");
  }
  // Os antecessores ficam fora do ensaio: seguir-se deles so acontece quando a ocorrencia nasce.
  const { previousTaskIds = [], ...taskInput } = template;
  await assertOwnedTasks(deps.tasks, previousTaskIds, actor);

  const { task, artifacts, derivations } = await deps.createTask.prepare(
    taskInput,
    actor,
    occurrenceWindow(rule, sampleDayOf(rule)),
    options,
  );
  return {
    template: {
      kind: task.kind as HumanTaskKind,
      ...(task.status ? { status: task.status as HumanTaskStatus } : {}),
      name: task.name,
      description: task.description,
      location: task.location,
      tags: [...task.tags],
      priority: task.priority,
      notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
      artifactIds: task.artifactLinks.map((link) => link.artifactId),
      previousTaskIds: [...new Set(previousTaskIds)],
    },
    artifacts,
    derivations,
  };
}

async function assertOwnedTasks(
  tasks: Pick<TaskRepository, "findByIds">,
  ids: readonly string[],
  actor: AuthenticatedUser,
): Promise<void> {
  if (ids.length === 0) return;
  const found = new Map((await tasks.findByIds(ids)).map((task) => [task.id, task]));
  for (const id of ids) {
    const task = found.get(id);
    if (!task) throw new TaskNotFoundError(`Task not found: ${id}`);
    if (task.userId !== actor.userId) throw new TaskOwnershipError();
  }
}

function linkOf(recurrence: Recurrence, dayKey: string): OccurrenceLink {
  return { recurrenceId: recurrence.id, occurrenceOn: dayKey, detached: false };
}

/** `liveArtifactIds`: os artefatos do template que ainda existem; um apagado some das ocorrencias novas. */
export function buildOccurrence(recurrence: Recurrence, dayKey: string, liveArtifactIds?: ReadonlySet<string>): Task {
  const template = storedTemplateOf(recurrence);
  const window = occurrenceWindow(recurrence.rule, dayKey);
  return Task.create({
    userId: recurrence.userId,
    kind: template.kind,
    status: template.status,
    name: template.name,
    description: template.description,
    location: template.location,
    startedAt: window.startedAt,
    estimatedFinishAt: window.estimatedFinishAt,
    tags: template.tags,
    priority: template.priority,
    notifyOffsetsMinutes: template.notifyOffsetsMinutes,
    // O mesmo artefato em todas as ocorrencias, cada uma com a propria relacao.
    artifactLinks: template.artifactIds
      .filter((artifactId) => !liveArtifactIds || liveArtifactIds.has(artifactId))
      .map((artifactId) => ({ artifactId, relation: "uses" as const, fromRecurrence: true })),
    occurrence: linkOf(recurrence, dayKey),
  });
}

/** Hoje, no fuso da regra: o dia a partir do qual "futuro" comeca para ela. */
export function todayOf(rule: RecurrenceRule, now: Date): string {
  return dayKeyOf(now, rule.timeZone);
}
