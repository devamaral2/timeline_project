import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { ArtifactRepository, EntityBatch, EntityBatchWriter, TaskRepository, SequenceChange } from "../../domain/ports";
import type { CreateTaskArtifactInput, CreateTaskInput } from "@repo/contracts";
import {
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  DEFAULT_TASK_KIND,
  Task,
  TaskValidationError,
  HUMAN_KINDS,
  HUMAN_STATUSES,
  type Artifact,
  type ArtifactLink,
  type HumanTaskKind,
  type HumanTaskStatus,
} from "../../domain/index";
import type { PlaceReverseGateway } from "../../infrastructure/places/photon-place-search.gateway";
import type { ArtifactBuilder } from "../artifacts/services/artifact-builder.service";
import { planSequence } from "./services/task-sequence";
import type { ResolvedTaskSchedule } from "./services/task-schedule.service";
import { getMealTaskName } from "./services/meal-task-name.service";

export const TASK_TIME_ZONE = "America/Sao_Paulo";

/** A tarefa montada e o que nasce ou muda com ela. Nada gravado ainda. */
export interface PreparedTask {
  task: Task;
  /** Os artefatos novos, na ordem em que aparecem na tarefa. */
  artifacts: Artifact[];
  /** De qual original saiu cada copia de alimento. */
  derivations: { originalId: string; copyId: string }[];
  /** A ordem da tarefa: de quais ela se segue e quais se seguem a ela. Ninguem e revisado por isso. */
  sequence: SequenceChange[];
}

/**
 * O controller ja recusa uma data invalida; aqui so traduzimos o que veio. Nao
 * ha limite de quao longe no passado ou no futuro a tarefa pode cair.
 */
export function parseInstant(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new TaskValidationError("Invalid date");
  return instant;
}

/** `derivedArtifacts: false` nao cria o alimento que uma tarefa de refeicao implicaria: quem cria artefatos e outro passo. */
export interface PrepareTaskOptions {
  derivedArtifacts?: boolean;
}

export function isHumanTaskKind(value: unknown): value is HumanTaskKind {
  return HUMAN_KINDS.includes(value as HumanTaskKind);
}

export function isHumanTaskStatus(value: unknown): value is HumanTaskStatus {
  return HUMAN_STATUSES.includes(value as HumanTaskStatus);
}

/** O tipo do artefato que da a natureza da tarefa quando ninguem disse qual e. */
const KIND_BY_ARTIFACT_TYPE: Readonly<Record<string, HumanTaskKind>> = {
  food: "meal",
  sleep: "sleep",
  training: "training",
};

export function toEntityBatch(prepared: PreparedTask): EntityBatch {
  return {
    userId: prepared.task.userId,
    artifacts: prepared.artifacts.map((entity) => ({ op: "create", entity })),
    derivations: prepared.derivations,
    tasks: [{ op: "create", entity: prepared.task }],
    sequence: prepared.sequence,
  };
}

export class CreateTaskUseCase {
  constructor(
    private readonly taskRepository: Pick<TaskRepository, "findByIds">,
    private readonly artifactRepository: Pick<ArtifactRepository, "findByIds">,
    private readonly artifactBuilder: ArtifactBuilder,
    private readonly batchWriter: EntityBatchWriter,
    private readonly clock: () => Date = () => new Date(),
    private readonly placeReverse?: PlaceReverseGateway,
  ) {}

  async execute(
    input: CreateTaskInput,
    actor: AuthenticatedUser,
    schedule?: ResolvedTaskSchedule,
  ): Promise<{ taskId: string }> {
    const prepared = await this.prepare(input, actor, schedule);
    await this.save(prepared);
    return { taskId: prepared.task.id };
  }

  /** Grava o que `prepare` montou: os artefatos novos, a tarefa e a ordem dela, numa transacao so. */
  async save(prepared: PreparedTask): Promise<void> {
    await this.batchWriter.commit(toEntityBatch(prepared));
  }

  /** Monta um artefato como a criacao de tarefa montaria: alimento pendente, treino pelos exercicios globais. */
  buildArtifact(input: Exclude<CreateTaskArtifactInput, { copyOf: string }>, actor: AuthenticatedUser, at: Date): Promise<Artifact> {
    return this.artifactBuilder.fromCreateInput(input, actor.userId, at);
  }

  /**
   * Monta a tarefa sem gravar. A serie usa isto para validar o template. O
   * alimento so passa pelo agente depois da gravacao.
   */
  async prepare(
    input: CreateTaskInput,
    actor: AuthenticatedUser,
    schedule?: ResolvedTaskSchedule,
    options: PrepareTaskOptions = {},
  ): Promise<PreparedTask> {
    if (input.kind !== undefined && !isHumanTaskKind(input.kind)) {
      throw new TaskValidationError(`Unknown task kind: ${String(input.kind)}`);
    }
    if (input.status !== undefined && !isHumanTaskStatus(input.status)) {
      throw new TaskValidationError(`Unknown task status: ${String(input.status)}`);
    }
    const now = this.clock();
    const tracked = input.status !== undefined || input.longRunning === true;
    // Uma tarefa de referencia sem inicio dito comeca agora; uma tarefa acompanhada pode nao ter data.
    const startedAt = schedule?.startedAt ?? parseInstant(input.startedAt) ?? (tracked ? undefined : now);
    const estimatedFinishAt = schedule?.estimatedFinishAt ?? parseInstant(input.estimatedFinishAt);
    const at = startedAt ?? now;
    const fallbackFoodText = () => input.description?.trim() || input.name?.trim() || getMealTaskName(at, TASK_TIME_ZONE);

    const created: Artifact[] = [];
    const derivations: PreparedTask["derivations"] = [];
    const links: ArtifactLink[] = [];

    for (const entry of input.artifacts ?? []) {
      if ("copyOf" in entry) {
        const original = await this.ownedOrGlobal(entry.copyOf, actor);
        const copy = original.copyForTask(actor.userId, entry.quantity);
        created.push(copy);
        derivations.push({ originalId: original.id, copyId: copy.id });
        links.push({ artifactId: copy.id, relation: "uses", fromRecurrence: false });
        continue;
      }
      const artifact = await this.artifactBuilder.fromCreateInput(
        entry.type === "food" && !entry.data?.inputText?.trim() ? { ...entry, data: { inputText: fallbackFoodText() } } : entry,
        actor.userId,
        at,
      );
      created.push(artifact);
      links.push({ artifactId: artifact.id, relation: "creates", fromRecurrence: false });
    }

    const existing: Artifact[] = [];
    for (const artifactId of input.artifactIds ?? []) {
      existing.push(await this.ownedOrGlobal(artifactId, actor));
      links.push({ artifactId, relation: "uses", fromRecurrence: false });
    }

    const kind = input.kind ?? inferKind([...created, ...existing]);
    if (options.derivedArtifacts !== false && kind === "meal" && ![...created, ...existing].some((artifact) => artifact.type === "food")) {
      const food = await this.artifactBuilder.fromCreateInput({ type: "food", data: { inputText: fallbackFoodText() } }, actor.userId, at);
      created.push(food);
      links.push({ artifactId: food.id, relation: "creates", fromRecurrence: false });
    }

    const task = Task.create({
      userId: actor.userId,
      kind,
      status: input.status,
      priority: input.priority,
      name: input.name ?? deriveName(kind, at, created),
      description: input.description ?? "",
      location: input.location ?? (await this.locate(input.coordinates)),
      startedAt,
      estimatedFinishAt,
      finishedAt: parseInstant(input.finishedAt),
      notifyOffsetsMinutes: input.notifyOffsetsMinutes,
      tags: input.tags ?? [],
      longRunning: input.longRunning,
      artifactLinks: links,
    });

    const sequence = await planSequence(
      task.id,
      { previousIds: [], nextIds: [] },
      { previousIds: input.previousTaskIds ?? [], nextIds: input.nextTaskIds ?? [] },
      this.taskRepository,
      actor.userId,
    );
    return { task, artifacts: created, derivations, sequence };
  }

  /** O endereco de onde a pessoa esta; sem coordenadas, sem servico ou sem resposta, a tarefa fica sem local. */
  private async locate(point: CreateTaskInput["coordinates"]): Promise<string | undefined> {
    if (!point || !this.placeReverse) return undefined;
    return (await this.placeReverse.reverse(point))?.label;
  }

  /** Um artefato que ja existe so entra na tarefa se for do usuario ou global. */
  private async ownedOrGlobal(artifactId: string, actor: AuthenticatedUser): Promise<Artifact> {
    const [artifact] = await this.artifactRepository.findByIds([artifactId]);
    if (!artifact) throw new ArtifactNotFoundError(`Artifact not found: ${artifactId}`);
    if (!artifact.isGlobal && artifact.userId !== actor.userId) throw new ArtifactOwnershipError();
    return artifact;
  }
}

function deriveName(kind: HumanTaskKind, at: Date, artifacts: readonly Artifact[]): string {
  switch (kind) {
    case "sleep":
      return "Sono";
    case "training":
      return "Treino";
    case "meal":
      return artifacts.find((artifact) => artifact.type === "food")?.name ?? getMealTaskName(at, TASK_TIME_ZONE);
    default:
      throw new TaskValidationError("Task requires a name");
  }
}

/** Sem `kind` dito, o primeiro artefato de alimento, sono ou treino (novo ou ja existente) da a natureza; senao e rotina. */
function inferKind(artifacts: readonly Artifact[]): HumanTaskKind {
  for (const artifact of artifacts) {
    const kind = KIND_BY_ARTIFACT_TYPE[artifact.type];
    if (kind) return kind;
  }
  return DEFAULT_TASK_KIND as HumanTaskKind;
}
