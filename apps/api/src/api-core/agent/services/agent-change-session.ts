import {
  Artifact,
  type Task,
  type TaskArtifactRelationKind,
  type OccurrenceLink,
  type Recurrence,
} from "../../../domain";
import type {
  ArtifactRepository,
  EntityBatch,
  SubtaskChange,
  TaskRepository,
  RecurrenceChange,
  RecurrenceRepository,
  StagedChange,
} from "../../../domain/ports";
import type { CreateArtifactInput, CreateTaskInput, CreateRecurrenceInput } from "@repo/contracts";
import { dayKeyOf, expandOccurrences, shiftDayKey } from "@repo/timeline";
import type { CreateTaskUseCase, PrepareTaskOptions } from "../../tasks/create-task.usecase";
import { prepareRecurrence } from "../../recurrences/prepare-recurrence";
import { buildOccurrence, storedTemplateOf } from "../../recurrences/recurrence-templates";
import { reviseRecurrence, type RecurrenceRevision } from "../../recurrences/revise-recurrence";

/** Quatro anos a frente cobrem ate o 29 de fevereiro: a primeira ocorrencia de qualquer regra valida cai ali. */
function firstSearchLimit(from: string): string {
  return shiftDayKey(from, 366 * 4);
}

export type EntityKind = "task" | "artifact";

export interface StagedRef {
  kind: EntityKind;
  id: string;
}

export type StageResult =
  | { ok: true; kind: EntityKind | "recurrence"; op: "create" | "update"; id: string }
  | { ok: false; error: string };

/** Uma serie criada ou alterada neste pedido. */
interface StagedSeries {
  op: "create" | "update";
  recurrence: Recurrence;
  /** Alterada: a revisao lida quando a mudanca foi preparada. */
  expectedRevision?: number;
  /** Alterada: o dia a partir do qual as ocorrencias saem. */
  fromDay?: string;
}

export interface ArtifactFields {
  name?: string;
  /** O texto do artefato (`type` text). */
  content?: string;
  tags?: string[];
}

interface Owned {
  id: string;
  userId: string | undefined;
  revision: number;
}

/** O estado anterior fica guardado para saber de qual serie a entidade alterada era ocorrencia. */
interface Staged<T> {
  change: StagedChange<T>;
  before?: T;
}

/** Erro que volta para quem preparou a mudanca como resultado, nunca como excecao. */
export class StagingError extends Error {}

/**
 * As mudancas que o agente prepara num passo. Nada e gravado aqui: cada mudanca e validada contra o banco e
 * contra as anteriores, e o lote inteiro vai para o `EntityBatchWriter` so no fim.
 *
 * O usuario vem do pedido ja autorizado; nenhum agente o recebe. Ligar um artefato a uma tarefa edita a tarefa;
 * pôr uma tarefa como subtarefa de outra nao edita nenhuma das duas.
 */
export class AgentChangeSession {
  private readonly tasks = new Map<string, Staged<Task>>();
  private readonly artifacts = new Map<string, Staged<Artifact>>();
  private readonly recurrences = new Map<string, StagedSeries>();
  private readonly derivations: { originalId: string; copyId: string }[] = [];
  private readonly subtasks: SubtaskChange[] = [];

  constructor(
    readonly userId: string,
    private readonly repositories: {
      tasks: Pick<TaskRepository, "findById" | "findByIds">;
      artifacts: Pick<ArtifactRepository, "findById">;
      recurrences?: Pick<RecurrenceRepository, "findById">;
    },
    private readonly createTaskUseCase: Pick<CreateTaskUseCase, "prepare" | "buildArtifact">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** O dia civil de hoje no fuso dado: a data de partida de uma serie nova. */
  todayIn(timeZone: string): string {
    return dayKeyOf(this.clock(), timeZone);
  }

  /**
   * Uma serie nova. A primeira ocorrencia entra no mesmo lote: e uma linha de verdade em `tasks`, entao o
   * pedido a mostra e o app atualiza a lista. As demais saem da materializacao preguicosa, que ignora o dia que
   * ja existe; por isso a marca d'agua nao anda aqui.
   */
  createRecurrence(input: CreateRecurrenceInput, options?: PrepareTaskOptions): Promise<StageResult> {
    return this.attempt(async () => {
      const { recurrence, artifacts, derivations } = await prepareRecurrence(
        this.templateDeps, input, { userId: this.userId }, options,
      );
      const day = this.firstOccurrenceDay(recurrence, dayKeyOf(this.clock(), recurrence.rule.timeZone));
      if (!day) throw new StagingError("A recorrência não tem nenhuma ocorrência de hoje em diante.");

      this.stageTemplateArtifacts(artifacts, derivations);
      await this.stageOccurrence(recurrence, day);
      this.recurrences.set(recurrence.id, { op: "create", recurrence });
      return { ok: true, kind: "recurrence", op: "create", id: recurrence.id };
    });
  }

  /**
   * Altera a serie de hoje em diante, como `PATCH /api/recurrences`: as ocorrencias futuras que ninguem mexeu a
   * mao saem e a primeira da regra nova entra neste lote. As demais saem da proxima leitura da lista.
   */
  updateRecurrence(
    id: string,
    plan: (current: Recurrence) => RecurrenceRevision,
    options?: PrepareTaskOptions,
  ): Promise<StageResult> {
    return this.attempt(async () => {
      const current = await this.loadRecurrence(id);
      const { recurrence, artifacts, derivations, fromDay } = await reviseRecurrence(
        this.templateDeps, current, plan(current), { userId: this.userId }, this.clock(), options,
      );

      this.stageTemplateArtifacts(artifacts, derivations);
      const day = this.firstOccurrenceDay(recurrence, fromDay);
      if (day) await this.stageOccurrence(recurrence, day);
      this.recurrences.set(id, { op: "update", recurrence, expectedRevision: current.revision, fromDay });
      return { ok: true, kind: "recurrence", op: "update", id };
    });
  }

  /** Os artefatos novos da tarefa entram no mesmo lote, antes dela (a relacao aponta para eles). */
  createTask(input: CreateTaskInput, options?: PrepareTaskOptions): Promise<StageResult> {
    return this.attempt(async () => {
      const prepared = await this.createTaskUseCase.prepare(input, { userId: this.userId }, undefined, options);
      this.stageSubtasks(prepared.subtasks);
      this.stageTemplateArtifacts(prepared.artifacts, prepared.derivations);
      this.tasks.set(prepared.task.id, { change: { op: "create", entity: prepared.task } });
      return { ok: true, kind: "task", op: "create", id: prepared.task.id };
    });
  }

  /**
   * `revise` recebe a tarefa atual (a do banco ou a ja preparada neste pedido) e devolve a versao nova. A criada
   * neste pedido continua sendo uma criacao.
   */
  reviseTask(id: string, revise: (current: Task) => Task): Promise<StageResult> {
    return this.attempt(async () => {
      const op = await this.reviseTarget(this.tasks, id, (key) => this.findTask(key), revise);
      return { ok: true, kind: "task", op, id };
    });
  }

  /**
   * Faz `subtaskId` subtarefa de `parentId`; se ela estava sob outra principal, sai de la. Nenhuma das duas e
   * revisada, e qualquer uma pode ser tarefa de agente. O resultado e a subtarefa. Repetir a ligacao nao faz nada.
   */
  addSubtask(parentId: string, subtaskId: string): Promise<StageResult> {
    return this.attempt(async () => {
      if (parentId === subtaskId) throw new StagingError("Uma tarefa não é subtarefa dela mesma.");
      await this.assertHierarchyEnd(parentId);
      await this.assertHierarchyEnd(subtaskId);
      this.stageSubtasks([{ op: "add", parentId, subtaskId }]);
      return { ok: true, kind: "task", op: "update", id: subtaskId };
    });
  }

  /** O artefato passa a aparecer na tarefa, depois dos que ja estavam. Quem e editado e a tarefa. */
  linkArtifact(artifactId: string, taskId: string, relation: TaskArtifactRelationKind): Promise<StageResult> {
    return this.attempt(async () => {
      await this.assertArtifactExists(artifactId);
      const op = await this.reviseTarget(this.tasks, taskId, (key) => this.findTask(key), (task) =>
        task.artifactLinks.some((link) => link.artifactId === artifactId)
          ? task
          : task.revise({ artifactLinks: [...task.artifactLinks, { artifactId, relation, fromRecurrence: false }] }),
      );
      return { ok: true, kind: "task", op, id: taskId };
    });
  }

  /** Monta como a criacao de tarefa montaria: alimento pendente, treino pelos exercicios globais. */
  buildArtifact(input: CreateArtifactInput, at: Date): Promise<Artifact> {
    return this.createTaskUseCase.buildArtifact(input, { userId: this.userId }, at);
  }

  /** Um artefato novo, ainda solto: quem o monta decide onde ele aparece. */
  stageNewArtifact(artifact: Artifact): void {
    this.artifacts.set(artifact.id, { change: { op: "create", entity: artifact } });
  }

  /** Revisa um artefato que ja existe (ou criado neste pedido), sem mexer nas tarefas em que ele aparece. */
  async reviseArtifactById(id: string, revise: (current: Artifact) => Artifact): Promise<void> {
    await this.reviseTarget(this.artifacts, id, (key) => this.repositories.artifacts.findById(key), revise);
  }

  /** Um artefato de texto novo. */
  createArtifact(fields: ArtifactFields): Promise<StageResult> {
    return this.attempt(async () => {
      if (!fields.content) throw new StagingError("content é obrigatório para criar um artefato de texto.");
      const artifact = Artifact.create({
        userId: this.userId, name: fields.name, type: "text", data: { body: fields.content }, tags: fields.tags,
      });
      this.stageNewArtifact(artifact);
      return { ok: true, kind: "artifact", op: "create", id: artifact.id };
    });
  }

  updateArtifact(id: string, fields: ArtifactFields): Promise<StageResult> {
    return this.attempt(async () => {
      await this.reviseArtifactById(id, (current) => {
        if (fields.content !== undefined && current.type !== "text") {
          throw new StagingError(`O artefato ${id} é do tipo ${current.type}: só artefatos de texto têm content.`);
        }
        return current.revise({
          name: fields.name,
          tags: fields.tags,
          data: fields.content !== undefined ? { body: fields.content } : undefined,
        });
      });
      return { ok: true, kind: "artifact", op: "update", id };
    });
  }

  toBatch(): EntityBatch {
    const changes = <T>(staged: Map<string, Staged<T>>) => [...staged.values()].map((entry) => entry.change);
    const series = [...this.recurrences.values()];
    return {
      userId: this.userId,
      tasks: changes(this.tasks),
      artifacts: changes(this.artifacts),
      derivations: [...this.derivations],
      subtasks: [...this.subtasks],
      recurrences: series.filter((staged) => staged.op === "create").map((staged) => staged.recurrence),
      recurrenceChanges: series.flatMap((staged): RecurrenceChange[] =>
        staged.op === "update"
          ? [{
            op: "update", recurrence: staged.recurrence,
            expectedRevision: staged.expectedRevision as number, fromDay: staged.fromDay as string,
          }]
          : []),
    };
  }

  /** O que este pedido cria e o que altera, na ordem em que foi preparado. */
  result(): { created: StagedRef[]; updated: StagedRef[] } {
    const result = { created: [] as StagedRef[], updated: [] as StagedRef[] };
    const collect = (kind: EntityKind, staged: Map<string, Staged<Owned>>) => {
      for (const [id, { change }] of staged) {
        if (change.op === "create") result.created.push({ kind, id });
        else if (change.op === "update") result.updated.push({ kind, id });
      }
    };
    collect("task", this.tasks);
    collect("artifact", this.artifacts);
    return result;
  }

  private get templateDeps() {
    return { createTask: this.createTaskUseCase, tasks: this.repositories.tasks };
  }

  private stageTemplateArtifacts(
    artifacts: readonly Artifact[],
    derivations: readonly { originalId: string; copyId: string }[],
  ): void {
    for (const artifact of artifacts) this.stageNewArtifact(artifact);
    this.derivations.push(...derivations);
  }

  /** O primeiro dia da regra de `from` em diante. */
  private firstOccurrenceDay(recurrence: Recurrence, from: string): string | undefined {
    return expandOccurrences(recurrence.rule, from, firstSearchLimit(from))[0];
  }

  /** A ocorrencia nasce subtarefa da principal do template, como as que a serie gera depois. */
  private async stageOccurrence(recurrence: Recurrence, day: string): Promise<void> {
    const occurrence = buildOccurrence(recurrence, day);
    this.tasks.set(occurrence.id, { change: { op: "create", entity: occurrence } });
    const parentId = storedTemplateOf(recurrence).parentTaskId;
    if (parentId) {
      const related = await this.addSubtask(parentId, occurrence.id);
      if (!related.ok) throw new StagingError(related.error);
    }
  }

  /**
   * As arestas entram uma vez so: o agente pode repetir a ligacao sem que o lote a grave duas vezes. Uma
   * subtarefa tem uma principal so, entao duas principais para a mesma tarefa no mesmo pedido sao recusadas.
   */
  private stageSubtasks(changes: readonly SubtaskChange[]): void {
    const fresh = changes.filter((change) => !this.subtasks.some(
      (staged) => staged.op === change.op && staged.parentId === change.parentId && staged.subtaskId === change.subtaskId,
    ));
    // Confere tudo antes de guardar qualquer aresta: uma recusa nao deixa o lote pela metade.
    for (const change of fresh) {
      if (change.op !== "add") continue;
      const otherParent = [...this.subtasks, ...fresh].find(
        (staged) => staged.op === "add" && staged.subtaskId === change.subtaskId && staged.parentId !== change.parentId,
      );
      if (otherParent) {
        throw new StagingError(
          `A tarefa ${change.subtaskId} já é subtarefa de ${otherParent.parentId} neste pedido: uma tarefa tem uma só principal.`,
        );
      }
    }
    this.subtasks.push(...fresh);
  }

  /** A serie do banco, que ainda nao foi tocada neste pedido nem tem ocorrencia dela alterada aqui. */
  private async loadRecurrence(id: string): Promise<Recurrence> {
    const staged = this.recurrences.get(id);
    if (staged?.op === "create") {
      throw new StagingError(`A recorrência ${id} foi criada neste mesmo pedido: inclua tudo na criação.`);
    }
    if (staged) throw new StagingError(`A recorrência ${id} já foi alterada neste pedido.`);
    if (!this.repositories.recurrences) throw new StagingError("Recorrências indisponíveis.");

    const found = await this.repositories.recurrences.findById(id);
    if (!found || found.userId !== this.userId) throw new StagingError(`Não encontrei a recorrência ${id}.`);

    // As ocorrencias alteradas aqui sairiam junto com a serie e o lote falharia no meio.
    const touched = [...this.tasks.values()].some((entry) => entry.before?.occurrence?.recurrenceId === id);
    if (touched) {
      throw new StagingError(`Uma ocorrência da recorrência ${id} já foi alterada neste pedido: faça a série em outro pedido.`);
    }
    return found;
  }

  /** So tarefas de pessoa: os pedidos e os passos do agente nao sao alvo de edicao. */
  private async findTask(id: string): Promise<Task | null> {
    const task = await this.repositories.tasks.findById(id);
    return task?.actor === "human" ? task : null;
  }

  /** Uma ponta da hierarquia: criada neste pedido ou do usuario, de pessoa ou de agente. */
  private async assertHierarchyEnd(id: string): Promise<void> {
    if (this.tasks.has(id)) return;
    const found = await this.repositories.tasks.findById(id);
    if (!found || found.userId !== this.userId) throw new StagingError(`Não encontrei a tarefa ${id}.`);
  }

  private async assertArtifactExists(id: string): Promise<void> {
    if (this.artifacts.get(id)?.change.op === "create") return;
    const found = await this.repositories.artifacts.findById(id);
    if (!found || (!found.isGlobal && found.userId !== this.userId)) {
      throw new StagingError(`Não encontrei o artefato ${id}.`);
    }
  }

  /** Revisa um alvo: a criada neste pedido continua sendo uma criacao; a do banco vira uma atualizacao. */
  private async reviseTarget<T extends Owned>(
    staged: Map<string, Staged<T>>,
    id: string,
    find: (id: string) => Promise<T | null>,
    revise: (current: T) => T,
  ): Promise<"create" | "update"> {
    const existing = staged.get(id);
    if (existing?.change.op === "create") {
      staged.set(id, { change: { op: "create", entity: revise(existing.change.entity) } });
      return "create";
    }
    const loaded = await this.loadForChange(staged, id, find);
    const revised = revise(loaded.current);
    if (revised !== loaded.current) {
      staged.set(id, {
        change: { op: "update", entity: revised, expectedRevision: loaded.expectedRevision },
        before: loaded.before,
      });
    }
    return "update";
  }

  /**
   * O registro de que a mudanca parte: o ja preparado (mantendo a revisao lida do banco da primeira vez) ou o
   * do banco. Registro de outro usuario recebe o mesmo "nao encontrado" de um id que nao existe.
   */
  private async loadForChange<T extends Owned>(
    staged: Map<string, Staged<T>>,
    id: string,
    find: (id: string) => Promise<T | null>,
  ): Promise<{ current: T; expectedRevision: number; before: T }> {
    const existing = staged.get(id);
    if (existing?.change.op === "update") {
      return {
        current: existing.change.entity,
        expectedRevision: existing.change.expectedRevision,
        before: existing.before as T,
      };
    }

    const found = await find(id);
    if (!found || found.userId !== this.userId) throw new StagingError(`Não encontrei o registro ${id}.`);
    const seriesId = (found as { occurrence?: OccurrenceLink }).occurrence?.recurrenceId;
    if (seriesId && this.recurrences.has(seriesId)) {
      // A serie alterada leva a ocorrencia embora no mesmo lote.
      throw new StagingError(`O registro ${id} é de uma recorrência alterada neste pedido: faça em outro pedido.`);
    }
    return { current: found, expectedRevision: found.revision, before: found };
  }

  private async attempt(stage: () => Promise<StageResult>): Promise<StageResult> {
    try {
      return await stage();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
