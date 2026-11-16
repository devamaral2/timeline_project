import {
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  TaskValidationError,
  type Artifact,
  type ArtifactLink,
  type ArtifactWrites,
  type Task,
} from "../../../domain/index";
import type { ArtifactRepository, EntityBatch, TaskRepository, SequenceChange } from "../../../domain/ports";
import type { UpdateTaskArtifactInput, UpdateTaskInput } from "@repo/contracts";
import type { ArtifactBuilder, ArtifactContentInput } from "../../artifacts/services/artifact-builder.service";
import { isHumanTaskKind, isHumanTaskStatus } from "../create-task.usecase";
import { planSequence } from "./task-sequence";

/** A tarefa revisada e o que precisa ser gravado junto com ela. */
export interface MergedTaskUpdate {
  task: Task;
  artifacts: Required<ArtifactWrites>;
  /** As arestas da ordem que mudaram. Nenhuma tarefa e revisada por isso. */
  sequence: SequenceChange[];
}

export interface TaskUpdateDeps {
  artifactBuilder: ArtifactBuilder;
  artifactRepository: Pick<ArtifactRepository, "findByIds">;
  taskRepository: Pick<TaskRepository, "findByIds">;
}

function instantChange(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new TaskValidationError("Invalid date");
  return instant;
}

export function toUpdateBatch(merged: MergedTaskUpdate, expectedRevision: number): EntityBatch {
  return {
    userId: merged.task.userId,
    artifacts: [
      ...merged.artifacts.created.map((entity) => ({ op: "create" as const, entity })),
      ...merged.artifacts.updated.map(({ artifact, expectedRevision: revision }) => ({
        op: "update" as const, entity: artifact, expectedRevision: revision,
      })),
    ],
    derivations: merged.artifacts.derivations,
    tasks: [{ op: "update", entity: merged.task, expectedRevision }],
    sequence: merged.sequence,
  };
}

export async function mergeTaskUpdate(
  existingTask: Task,
  input: UpdateTaskInput,
  deps: TaskUpdateDeps,
): Promise<MergedTaskUpdate> {
  if (input.kind !== undefined && !isHumanTaskKind(input.kind)) {
    throw new TaskValidationError(`Unknown task kind: ${String(input.kind)}`);
  }
  if (input.status !== undefined && input.status !== null && !isHumanTaskStatus(input.status)) {
    throw new TaskValidationError(`Unknown task status: ${String(input.status)}`);
  }
  const startedAt = instantChange(input.startedAt);

  const merged: { links: ArtifactLink[] | undefined; writes: Required<ArtifactWrites> } = input.artifacts
    ? await mergeArtifacts(existingTask, input.artifacts, deps)
    : { links: undefined, writes: { created: [], updated: [], derivations: [] } };

  // Uma tarefa de refeicao sempre tem um alimento: sem nenhum, nasce um a partir do que a tarefa diz.
  if ((input.kind ?? existingTask.kind) === "meal") {
    const links = merged.links ?? existingTask.artifactLinks;
    const staged = [...merged.writes.created, ...merged.writes.updated.map(({ artifact }) => artifact)];
    const byId = new Map(staged.map((artifact) => [artifact.id, artifact]));
    const unresolved = links.map(({ artifactId }) => artifactId).filter((id) => !byId.has(id));
    const persisted = unresolved.length ? await deps.artifactRepository.findByIds(unresolved) : [];
    for (const artifact of persisted) byId.set(artifact.id, artifact);
    const hasFood = links.some(({ artifactId }) => byId.get(artifactId)?.type === "food");
    if (!hasFood) {
      const food = await deps.artifactBuilder.fromCreateInput(
        {
          type: "food",
          data: { inputText: (input.description ?? existingTask.description).trim() || (input.name ?? existingTask.name) },
        },
        existingTask.userId,
        startedAt ?? existingTask.startedAt ?? new Date(),
      );
      merged.writes = { ...merged.writes, created: [...merged.writes.created, food] };
      merged.links = [...links, { artifactId: food.id, relation: "creates", fromRecurrence: false }];
    }
  }

  const task = existingTask.revise({
    kind: input.kind,
    status: input.status,
    priority: input.priority,
    name: input.name,
    description: input.description,
    location: input.location,
    startedAt,
    estimatedFinishAt: instantChange(input.estimatedFinishAt),
    finishedAt: instantChange(input.finishedAt),
    notifyOffsetsMinutes: input.notifyOffsetsMinutes,
    tags: input.tags,
    longRunning: input.longRunning,
    artifactLinks: merged.links,
  });

  const sequence = await planSequence(
    existingTask.id,
    { previousIds: existingTask.previousIds, nextIds: existingTask.nextIds },
    { previousIds: input.previousTaskIds, nextIds: input.nextTaskIds },
    deps.taskRepository,
    existingTask.userId,
  );
  return { task, artifacts: merged.writes, sequence };
}

/**
 * A lista de artefatos de uma tarefa ao editar. Cada entrada com `id` e um
 * artefato que ja existe: ja estava na tarefa, ou e outro do usuario (ou
 * global) que passa a estar. Sem `id`, nasce um artefato novo; com `copyOf`,
 * uma copia de um alimento. Quem nao esta na lista deixa de aparecer no
 * tarefa, mas o artefato continua existindo.
 */
async function mergeArtifacts(
  existingTask: Task,
  entries: UpdateTaskArtifactInput[],
  deps: TaskUpdateDeps,
): Promise<{ links: ArtifactLink[]; writes: Required<ArtifactWrites> }> {
  const ids = entries.flatMap((entry) => ("copyOf" in entry ? [entry.copyOf] : entry.id ? [entry.id] : []));
  const found = ids.length > 0 ? await deps.artifactRepository.findByIds(ids) : [];
  const byId = new Map(found.map((artifact) => [artifact.id, artifact]));
  const currentLinks = new Map(existingTask.artifactLinks.map((link) => [link.artifactId, link]));
  const reachable = (id: string): Artifact => {
    const artifact = byId.get(id);
    if (!artifact) throw new ArtifactNotFoundError(`Artifact not found: ${id}`);
    if (!artifact.isGlobal && artifact.userId !== existingTask.userId) throw new ArtifactOwnershipError();
    return artifact;
  };

  const created: Artifact[] = [];
  const updated: { artifact: Artifact; expectedRevision: number }[] = [];
  const derivations: { originalId: string; copyId: string }[] = [];
  const links: ArtifactLink[] = [];

  for (const entry of entries) {
    if ("copyOf" in entry) {
      const original = reachable(entry.copyOf);
      const copy = original.copyForTask(existingTask.userId, entry.quantity);
      created.push(copy);
      derivations.push({ originalId: original.id, copyId: copy.id });
      links.push({ artifactId: copy.id, relation: "uses", fromRecurrence: false });
      continue;
    }

    if (!entry.id) {
      if (entry.data === undefined) throw new TaskValidationError("A new artifact requires data");
      const artifact = await deps.artifactBuilder.fromUpdateInput(entry as ArtifactContentInput, existingTask.userId);
      created.push(artifact);
      links.push({ artifactId: artifact.id, relation: entry.relation ?? "creates", fromRecurrence: false });
      continue;
    }

    const artifact = reachable(entry.id);
    const revised = await reviseArtifact(artifact, entry, deps.artifactBuilder);
    if (revised) updated.push({ artifact: revised, expectedRevision: artifact.revision });
    const current = currentLinks.get(artifact.id);
    links.push({
      artifactId: artifact.id,
      relation: entry.relation ?? current?.relation ?? "uses",
      // A relacao herdada da serie continua sendo da serie, mesmo se o artefato foi editado aqui.
      fromRecurrence: current?.fromRecurrence ?? false,
    });
  }

  return { links, writes: { created, updated, derivations } };
}

/** `undefined` quando a entrada so mantem o artefato, sem mudar nada nele. */
async function reviseArtifact(
  artifact: Artifact,
  entry: Exclude<UpdateTaskArtifactInput, { copyOf: string }>,
  artifactBuilder: ArtifactBuilder,
): Promise<Artifact | undefined> {
  if (entry.name === undefined && entry.tags === undefined && entry.data === undefined) return undefined;

  const resolved = entry.data !== undefined ? await artifactBuilder.resolveUpdateData(entry as ArtifactContentInput) : undefined;
  return artifact.revise({
    name: entry.name,
    tags: entry.tags,
    type: resolved?.type,
    schemaVersion: "schemaVersion" in entry ? entry.schemaVersion : undefined,
    data: resolved?.data,
  });
}
