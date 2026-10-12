import {
  AgentChatMessage,
  Note,
  Task,
  type AgentConversation,
  type Event,
  type EventKind,
  type OccurrenceLink,
  type Recurrence,
  type TaskReviseChanges,
} from "../../../domain";
import type {
  ConversationAppend,
  EntityBatch,
  EventRepository,
  NoteRepository,
  RecurrenceChange,
  RecurrenceRepository,
  StagedChange,
  TaskRepository,
} from "../../../domain/ports";
import type {
  AgentChatEntityRef,
  AgentEntityItem,
  CreateEventInput,
  CreateNoteInput,
  CreateRecurrenceInput,
} from "@repo/contracts";
import { dayKeyOf, expandOccurrences } from "@repo/timeline";
import type { CreateEventUseCase } from "../../events/create-event.usecase";
import { prepareRecurrence } from "../../recurrences/prepare-recurrence";
import { buildEventOccurrence, buildTaskOccurrenceOf, todayOf } from "../../recurrences/recurrence-templates";
import { reviseRecurrence, type RecurrenceRevision } from "../../recurrences/revise-recurrence";
import { assertParentTaskAssignable } from "../../tasks/assert-parent-task";
import { firstSearchLimit } from "../skills/recurrence-rule";
import { eventItem, noteItem, taskItem } from "./agent-entity-dto";

export type EntityKind = "event" | "task" | "note";
type DeletableKind = EntityKind | "recurrence";

export type StageResult =
  | { ok: true; kind: EntityKind | "recurrence"; op: "create" | "update" | "delete"; id: string }
  | { ok: false; error: string };

/** Uma serie criada, alterada ou apagada neste pedido. */
export interface StagedSeries {
  op: "create" | "update" | "delete";
  /** Criada: a nova. Alterada: a revisada. Apagada: a que existia. */
  recurrence: Recurrence;
  /**
   * A ocorrencia que a resposta mostra no lugar da serie (que nao e uma
   * entidade do chat): a primeira da serie nova ou revisada, ou a proxima que
   * a mudanca levou embora. E o que faz o app atualizar a lista.
   */
  shownOccurrenceId?: string;
  /** Alterada: a revisao lida quando a mudanca foi preparada. */
  expectedRevision?: number;
  /** Alterada ou apagada: o dia a partir do qual as ocorrencias saem. */
  fromDay?: string;
}

export interface TaskCreateFields {
  name: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  parentTaskId?: string;
  tags?: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
}

export interface NoteFields {
  name?: string;
  /** O texto da nota (`type` text). */
  content?: string;
  /** A nota passa a aparecer nesta tarefa, depois das que ja estavam. */
  taskId?: string;
  /** A nota passa a aparecer neste evento, depois das que ja estavam. */
  eventId?: string;
  tags?: string[];
}

interface Owned {
  id: string;
  userId: string;
  revision: number;
}

/** O estado anterior e guardado para a resposta listar o que foi apagado. */
interface Staged<T> {
  change: StagedChange<T>;
  before?: T;
}

/** Erro que volta para o modelo como resultado da ferramenta. */
export class StagingError extends Error {}

/**
 * As mudancas que o agente prepara numa requisicao. Nada e gravado aqui: cada
 * mudanca e validada contra o banco e contra as anteriores, e o lote inteiro
 * vai para o `EntityBatchWriter` so no fim.
 *
 * O usuario vem da requisicao ja autorizada — nenhuma ferramenta o recebe.
 */
export class AgentChangeSession {
  private readonly events = new Map<string, Staged<Event>>();
  private readonly tasks = new Map<string, Staged<Task>>();
  private readonly notes = new Map<string, Staged<Note>>();
  private readonly recurrences = new Map<string, StagedSeries>();
  /** Ocorrencias que uma serie alterada ou apagada leva embora e a resposta mostra no lugar dela. */
  private readonly removedPreviews: AgentEntityItem[] = [];
  private conversationTurn: ConversationAppend | undefined;

  constructor(
    readonly userId: string,
    private readonly repositories: {
      events: Pick<EventRepository, "findById">;
      tasks: Pick<TaskRepository, "findById">;
      notes: Pick<NoteRepository, "findById" | "findByIds">;
      recurrences?: Pick<RecurrenceRepository, "findById" | "findNextOccurrenceId">;
    },
    private readonly createEventUseCase: Pick<CreateEventUseCase, "prepare" | "buildNote">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** O dia civil de hoje no fuso dado — a data de partida de uma serie nova. */
  todayIn(timeZone: string): string {
    return dayKeyOf(this.clock(), timeZone);
  }

  /**
   * Uma serie nova. A primeira ocorrencia entra no mesmo lote: e uma linha de
   * verdade em `events`/`tasks`, entao a resposta a mostra e o app atualiza a
   * lista. As demais saem da materializacao preguicosa, que ignora o dia que ja
   * existe — por isso a marca d'agua nao anda aqui.
   */
  createRecurrence(input: CreateRecurrenceInput): Promise<StageResult> {
    return this.attempt(async () => {
      const { recurrence, notes } = await prepareRecurrence(
        { createEvent: this.createEventUseCase, tasks: this.taskView },
        input,
        { userId: this.userId },
      );

      const day = this.firstOccurrenceDay(recurrence, dayKeyOf(this.clock(), recurrence.rule.timeZone));
      if (!day) throw new StagingError("A recorrência não tem nenhuma ocorrência de hoje em diante.");

      for (const note of notes) this.stageNewNote(note);
      const shownOccurrenceId = this.stageOccurrence(recurrence, day);
      this.recurrences.set(recurrence.id, { op: "create", recurrence, shownOccurrenceId });
      return { ok: true, kind: "recurrence", op: "create", id: recurrence.id };
    });
  }

  /**
   * Altera a serie de hoje em diante, como `PATCH /api/recurrences`: as
   * ocorrencias futuras que ninguem mexeu a mao saem e a primeira da regra nova
   * entra neste lote. As demais saem da proxima leitura da lista.
   */
  updateRecurrence(id: string, plan: (current: Recurrence) => RecurrenceRevision): Promise<StageResult> {
    return this.attempt(async () => {
      const current = await this.loadRecurrence(id);
      const { recurrence, notes, fromDay } = await reviseRecurrence(
        { createEvent: this.createEventUseCase, tasks: this.taskView },
        current,
        plan(current),
        { userId: this.userId },
        this.clock(),
      );

      for (const note of notes) this.stageNewNote(note);
      const day = this.firstOccurrenceDay(recurrence, fromDay);
      const shownOccurrenceId = day
        ? this.stageOccurrence(recurrence, day)
        : await this.previewRemoval(current, fromDay);
      this.recurrences.set(id, {
        op: "update", recurrence, shownOccurrenceId, expectedRevision: current.revision, fromDay,
      });
      return { ok: true, kind: "recurrence", op: "update", id };
    });
  }

  private deleteRecurrence(id: string): Promise<StageResult> {
    return this.attempt(async () => {
      const current = await this.loadRecurrence(id);
      const fromDay = todayOf(current.rule, this.clock());
      const shownOccurrenceId = await this.previewRemoval(current, fromDay);
      this.recurrences.set(id, { op: "delete", recurrence: current, shownOccurrenceId, fromDay });
      return { ok: true, kind: "recurrence", op: "delete", id };
    });
  }

  /** O primeiro dia da regra de `from` em diante. */
  private firstOccurrenceDay(recurrence: Recurrence, from: string): string | undefined {
    return expandOccurrences(recurrence.rule, from, firstSearchLimit(from))[0];
  }

  private stageOccurrence(recurrence: Recurrence, day: string): string {
    if (recurrence.target === "event") {
      const occurrence = buildEventOccurrence(recurrence, day);
      this.events.set(occurrence.id, { change: { op: "create", entity: occurrence } });
      return occurrence.id;
    }
    const occurrence = buildTaskOccurrenceOf(recurrence, day);
    this.tasks.set(occurrence.id, { change: { op: "create", entity: occurrence } });
    return occurrence.id;
  }

  /** A proxima ocorrencia que a mudanca leva embora, para a resposta e o app a mostrarem. */
  private async previewRemoval(recurrence: Recurrence, fromDay: string): Promise<string | undefined> {
    const id = await this.repositories.recurrences?.findNextOccurrenceId(recurrence.id, fromDay);
    if (!id) return undefined;
    if (recurrence.target === "event") {
      const event = await this.repositories.events.findById(id);
      if (event) this.removedPreviews.push(eventItem(event));
    } else {
      const task = await this.repositories.tasks.findById(id);
      if (task) this.removedPreviews.push(taskItem(task));
    }
    return id;
  }

  /** A serie do banco, que ainda nao foi tocada neste pedido nem tem ocorrencia dela alterada aqui. */
  private async loadRecurrence(id: string): Promise<Recurrence> {
    const staged = this.recurrences.get(id);
    if (staged?.op === "create") {
      throw new StagingError(`A recorrência ${id} foi criada nesta mesma requisição: inclua tudo na criação.`);
    }
    if (staged) throw new StagingError(`A recorrência ${id} já foi alterada nesta requisição.`);
    if (!this.repositories.recurrences) throw new StagingError("Recorrências indisponíveis.");

    const found = await this.repositories.recurrences.findById(id);
    if (!found || found.userId !== this.userId) throw new StagingError(`Não encontrei a recorrência ${id}.`);

    // As ocorrencias alteradas aqui sairiam junto com a serie e o lote falharia no meio.
    const touched = [...this.events.values(), ...this.tasks.values()].some(
      (entry) => (entry.before as { occurrence?: OccurrenceLink } | undefined)?.occurrence?.recurrenceId === id,
    );
    if (touched) {
      throw new StagingError(`Uma ocorrência da recorrência ${id} já foi alterada neste pedido: faça a série em outro pedido.`);
    }
    return found;
  }

  /** As series criadas, alteradas ou apagadas neste pedido. */
  series(): StagedSeries[] {
    return [...this.recurrences.values()];
  }

  /** As notes novas do evento entram no mesmo lote, antes dele (o vinculo aponta para elas). */
  createEvent(input: CreateEventInput): Promise<StageResult> {
    return this.attempt(async () => {
      const { event, notes } = await this.createEventUseCase.prepare(input, { userId: this.userId });
      for (const note of notes) this.stageNewNote(note);
      this.events.set(event.id, { change: { op: "create", entity: event } });
      return { ok: true, kind: "event", op: "create", id: event.id };
    });
  }

  /**
   * `revise` recebe o evento atual — o do banco ou o ja preparado nesta
   * requisicao — e devolve a versao nova.
   */
  updateEvent(
    id: string,
    kind: EventKind,
    revise: (current: Event) => Promise<Event>,
  ): Promise<StageResult> {
    return this.stageEventUpdate(id, kind, revise);
  }

  /**
   * Encerra um evento de qualquer tipo; sem `finishedAt`, vale o instante do
   * pedido. O tipo nao importa: so o fim muda.
   */
  finishEvent(id: string, finishedAt?: Date): Promise<StageResult> {
    return this.stageEventUpdate(id, undefined, async (current) => {
      const end = finishedAt ?? this.clock();
      if (end < current.startedAt) {
        throw new StagingError(`O evento ${current.name} ainda não começou: não dá para encerrá-lo antes do início.`);
      }
      return current.revise({ finishedAt: end });
    });
  }

  private stageEventUpdate(
    id: string,
    kind: EventKind | undefined,
    revise: (current: Event) => Promise<Event>,
  ): Promise<StageResult> {
    return this.attempt(async () => {
      const created = this.events.get(id);
      if (created?.change.op === "create") {
        const current = created.change.entity;
        if (kind && current.kind !== kind) throw new StagingError(`O evento ${id} é do tipo ${current.kind}, não ${kind}.`);
        this.events.set(id, { change: { op: "create", entity: await revise(current) } });
        return { ok: true, kind: "event", op: "create", id };
      }
      const loaded = await this.loadForChange(this.events, id, (key) => this.repositories.events.findById(key));
      if (kind && loaded.current.kind !== kind) {
        throw new StagingError(
          `O evento ${id} é do tipo ${loaded.current.kind}, não ${kind}. Use a ferramenta desse tipo.`,
        );
      }

      const revised = await revise(loaded.current);
      this.events.set(id, {
        change: { op: "update", entity: revised, expectedRevision: loaded.expectedRevision },
        before: loaded.before,
      });
      return { ok: true, kind: "event", op: "update", id };
    });
  }

  /** Monta uma note como a criacao montaria: a refeicao passa pelo modelo, o treino pelo catalogo. */
  buildNote(input: CreateNoteInput, startedAt: Date): Promise<Note> {
    return this.createEventUseCase.buildNote(input, { userId: this.userId }, startedAt);
  }

  /** A primeira note do evento com este `type`, ja considerando o que foi preparado nesta requisicao. */
  async noteOfType(event: Event, type: string): Promise<Note | undefined> {
    const ids = event.noteLinks.map((link) => link.noteId);
    const notes = await this.loadNotes(ids);
    return ids.map((id) => notes.get(id)).find((note) => note?.type === type);
  }

  /** Uma note nova, ainda sem vinculo — quem a monta decide onde ela aparece. */
  stageNewNote(note: Note): void {
    this.notes.set(note.id, { change: { op: "create", entity: note } });
  }

  /** Revisa uma note ja existente (ou criada nesta requisicao), sem mexer em quem aponta para ela. */
  async reviseNoteById(id: string, revise: (current: Note) => Note): Promise<void> {
    const staged = this.notes.get(id);
    if (staged?.change.op === "create") {
      this.notes.set(id, { change: { op: "create", entity: revise(staged.change.entity) } });
      return;
    }
    const loaded = await this.loadForChange(this.notes, id, (key) => this.repositories.notes.findById(key));
    this.notes.set(id, {
      change: { op: "update", entity: revise(loaded.current), expectedRevision: loaded.expectedRevision },
      before: loaded.before,
    });
  }

  createTask(fields: TaskCreateFields): Promise<StageResult> {
    return this.attempt(async () => {
      if (fields.parentTaskId) {
        await assertParentTaskAssignable(this.taskView, fields.parentTaskId, this.userId);
      }
      const task = Task.create({ ...fields, userId: this.userId, description: fields.description ?? "", tags: fields.tags ?? [] });
      this.tasks.set(task.id, { change: { op: "create", entity: task } });
      return { ok: true, kind: "task", op: "create", id: task.id };
    });
  }

  updateTask(id: string, changes: TaskReviseChanges): Promise<StageResult> {
    return this.attempt(async () => {
      const loaded = await this.loadForChange(this.tasks, id, (key) => this.repositories.tasks.findById(key));
      if (changes.parentTaskId) {
        await assertParentTaskAssignable(this.taskView, changes.parentTaskId, this.userId, id);
      }

      const revised = loaded.current.revise(changes);
      this.tasks.set(id, {
        change: { op: "update", entity: revised, expectedRevision: loaded.expectedRevision },
        before: loaded.before,
      });
      return { ok: true, kind: "task", op: "update", id };
    });
  }

  createNote(fields: NoteFields): Promise<StageResult> {
    return this.attempt(async () => {
      if (!fields.content) throw new StagingError("content é obrigatório para criar uma nota.");
      await this.assertNoteTargets(fields);
      const note = Note.create({
        userId: this.userId,
        name: fields.name,
        type: "text",
        data: { body: fields.content },
        tags: fields.tags,
      });
      this.stageNewNote(note);
      await this.attachNote(note.id, fields);
      return { ok: true, kind: "note", op: "create", id: note.id };
    });
  }

  updateNote(id: string, fields: NoteFields): Promise<StageResult> {
    return this.attempt(async () => {
      await this.assertNoteTargets(fields);
      // So ligar a nota a um evento ou tarefa nao e editar a nota: ela fica como esta.
      const edits = fields.name !== undefined || fields.tags !== undefined || fields.content !== undefined;
      if (edits) {
        await this.reviseNoteById(id, (current) => {
          if (fields.content !== undefined && current.type !== "text") {
            throw new StagingError(`A nota ${id} é do tipo ${current.type}: só notas de texto têm content.`);
          }
          return current.revise({
            name: fields.name,
            tags: fields.tags,
            data: fields.content !== undefined ? { body: fields.content } : undefined,
          });
        });
      } else {
        await this.assertNoteExists(id);
      }
      await this.attachNote(id, fields);
      return { ok: true, kind: "note", op: "update", id };
    });
  }

  delete(kind: DeletableKind, id: string): Promise<StageResult> {
    if (kind === "recurrence") return this.deleteRecurrence(id);
    return this.attempt(async () => {
      switch (kind) {
        case "event":
          await this.stageDelete(this.events, id, (key) => this.repositories.events.findById(key));
          break;
        case "task":
          await this.stageDelete(this.tasks, id, (key) => this.repositories.tasks.findById(key));
          break;
        case "note":
          await this.stageDelete(this.notes, id, (key) => this.repositories.notes.findById(key));
          break;
      }
      return { ok: true, kind, op: "delete", id };
    });
  }

  hasChanges(): boolean {
    return this.events.size + this.tasks.size + this.notes.size + this.recurrences.size > 0;
  }

  stagedEvent(id: string): Event | undefined {
    const entry = this.events.get(id);
    return entry?.change.op === "delete" ? undefined : entry?.change.entity;
  }

  /** O evento como estava no banco antes de ser alterado neste pedido; ausente se foi criado aqui. */
  eventBeforeChange(id: string): Event | undefined {
    return this.events.get(id)?.before;
  }

  /**
   * O turno de conversa entra no mesmo lote das entidades, e nao numa gravacao
   * propria: assim a conversa nunca registra uma escrita que o banco recusou.
   * Chamado uma unica vez, no fim do run, quando a resposta ja existe.
   */
  stageConversationTurn(
    conversation: { conversationId: string; create?: AgentConversation },
    userText: string,
    assistantText: string,
    entities: readonly AgentChatEntityRef[],
  ): void {
    const conversationId = conversation.conversationId;
    this.conversationTurn = {
      conversationId,
      create: conversation.create,
      messages: [
        AgentChatMessage.create({ conversationId, role: "user", content: userText }),
        AgentChatMessage.create({ conversationId, role: "assistant", content: assistantText, entities }),
      ],
    };
  }

  /** Ha o que gravar mesmo sem entidade nenhuma: um turno de pura consulta. */
  hasMessages(): boolean {
    return this.conversationTurn !== undefined;
  }

  toBatch(): EntityBatch {
    const changes = <T>(staged: Map<string, Staged<T>>) => [...staged.values()].map((entry) => entry.change);
    const series = this.series();
    return {
      userId: this.userId,
      events: changes(this.events),
      tasks: changes(this.tasks),
      notes: changes(this.notes),
      recurrences: series.filter((staged) => staged.op === "create").map((staged) => staged.recurrence),
      recurrenceChanges: series.flatMap((staged): RecurrenceChange[] => {
        if (staged.op === "update") {
          return [{
            op: "update", recurrence: staged.recurrence,
            expectedRevision: staged.expectedRevision as number, fromDay: staged.fromDay as string,
          }];
        }
        return staged.op === "delete"
          ? [{ op: "delete", id: staged.recurrence.id, fromDay: staged.fromDay as string }]
          : [];
      }),
      conversation: this.conversationTurn,
    };
  }

  /** Async porque o evento mostra as notes dele, e as que nao foram preparadas aqui vem do banco. */
  async result(): Promise<{ created: AgentEntityItem[]; updated: AgentEntityItem[]; deleted: AgentEntityItem[] }> {
    const result = { created: [] as AgentEntityItem[], updated: [] as AgentEntityItem[], deleted: [] as AgentEntityItem[] };
    const eventNoteIds = [...this.events.values()].flatMap(({ change, before }) => [
      ...(change.op === "delete" ? [] : change.entity.noteLinks),
      ...(before?.noteLinks ?? []),
    ]);
    const notes = await this.loadNotes(eventNoteIds.map((link) => link.noteId));
    const notesOf = (event: Event) =>
      event.noteLinks.flatMap((link) => {
        const note = notes.get(link.noteId);
        return note ? [note] : [];
      });

    // A note que o DTO de um evento ja mostra nao e listada de novo: a resposta contaria a mesma coisa duas vezes.
    const embedded = new Set(
      [...this.events.values()].flatMap(({ change }) =>
        change.op === "delete" ? [] : change.entity.noteLinks.map((link) => link.noteId),
      ),
    );

    const collect = <T>(
      staged: Map<string, Staged<T>>,
      toItem: (entity: T) => AgentEntityItem,
      skip: (entity: T) => boolean = () => false,
    ) => {
      for (const { change, before } of staged.values()) {
        if (change.op === "create") {
          if (!skip(change.entity)) result.created.push(toItem(change.entity));
        } else if (change.op === "update") {
          if (!skip(change.entity)) result.updated.push(toItem(change.entity));
        } else if (before) result.deleted.push(toItem(before));
      }
    };
    collect(this.events, (event) => eventItem(event, notesOf(event)));
    collect(this.tasks, taskItem);
    collect(this.notes, noteItem, (note) => embedded.has(note.id));
    result.deleted.push(...this.removedPreviews);
    return result;
  }

  /** Pai e dependencias enxergam o que ja foi preparado: uma subtarefa pode nascer sob um pai criado agora. */
  private readonly taskView = {
    findById: async (id: string): Promise<Task | null> => {
      const staged = this.tasks.get(id);
      if (staged) return staged.change.op === "delete" ? null : staged.change.entity;
      return this.repositories.tasks.findById(id);
    },
  };

  /**
   * As notes por id: a versao preparada nesta requisicao quando ha, senao a do
   * banco. Nota marcada para apagar nao aparece.
   */
  private async loadNotes(ids: readonly string[]): Promise<Map<string, Note>> {
    const found = new Map<string, Note>();
    const missing: string[] = [];
    for (const id of new Set(ids)) {
      const staged = this.notes.get(id);
      if (!staged) missing.push(id);
      else if (staged.change.op !== "delete") found.set(id, staged.change.entity);
    }
    if (missing.length > 0) {
      for (const note of await this.repositories.notes.findByIds(missing)) {
        if (note.userId === this.userId) found.set(note.id, note);
      }
    }
    return found;
  }

  private async assertNoteExists(id: string): Promise<void> {
    if (this.notes.get(id)?.change.op === "create") return;
    const found = await this.repositories.notes.findById(id);
    if (!found || found.userId !== this.userId) throw new StagingError(`Não encontrei o registro ${id}.`);
  }

  /** Liga a note ao evento e/ou tarefa pedidos. Ligar de novo a quem ja a tem nao faz nada. */
  private async attachNote(noteId: string, targets: Pick<NoteFields, "eventId" | "taskId">): Promise<void> {
    if (targets.eventId) {
      await this.reviseTarget(this.events, targets.eventId, (key) => this.repositories.events.findById(key), (event) =>
        event.noteLinks.some((link) => link.noteId === noteId)
          ? event
          : event.revise({ noteLinks: [...event.noteLinks, { noteId, fromRecurrence: false }] }),
      );
    }
    if (targets.taskId) {
      await this.reviseTarget(this.tasks, targets.taskId, (key) => this.repositories.tasks.findById(key), (task) =>
        task.noteLinks.some((link) => link.noteId === noteId)
          ? task
          : task.revise({ noteLinks: [...task.noteLinks, { noteId, fromRecurrence: false }] }),
      );
    }
  }

  /** Revisa um alvo: o criado nesta requisicao continua sendo uma criacao; o do banco vira uma atualizacao. */
  private async reviseTarget<T extends Owned>(
    staged: Map<string, Staged<T>>,
    id: string,
    find: (id: string) => Promise<T | null>,
    revise: (current: T) => T,
  ): Promise<void> {
    const existing = staged.get(id);
    if (existing?.change.op === "create") {
      staged.set(id, { change: { op: "create", entity: revise(existing.change.entity) } });
      return;
    }
    const loaded = await this.loadForChange(staged, id, find);
    const revised = revise(loaded.current);
    if (revised === loaded.current) return;
    staged.set(id, {
      change: { op: "update", entity: revised, expectedRevision: loaded.expectedRevision },
      before: loaded.before,
    });
  }

  private async assertNoteTargets(fields: NoteFields): Promise<void> {
    if (fields.taskId) {
      const task = await this.taskView.findById(fields.taskId);
      if (!task || task.userId !== this.userId) throw new StagingError(`Não encontrei a tarefa ${fields.taskId}.`);
    }
    if (fields.eventId) {
      const staged = this.events.get(fields.eventId);
      const event = staged
        ? staged.change.op === "delete"
          ? null
          : staged.change.entity
        : await this.repositories.events.findById(fields.eventId);
      if (!event || event.userId !== this.userId) throw new StagingError(`Não encontrei o evento ${fields.eventId}.`);
    }
  }

  private async stageDelete<T extends Owned>(
    staged: Map<string, Staged<T>>,
    id: string,
    find: (id: string) => Promise<T | null>,
  ): Promise<void> {
    const loaded = await this.loadForChange(staged, id, find);
    staged.set(id, {
      change: { op: "delete", id, expectedRevision: loaded.expectedRevision },
      before: loaded.before,
    });
  }

  /**
   * O registro que a mudanca parte: o ja preparado (mantendo a revisao lida do
   * banco da primeira vez) ou o do banco. Registro de outro usuario recebe o
   * mesmo "nao encontrado" de um id que nao existe.
   */
  private async loadForChange<T extends Owned>(
    staged: Map<string, Staged<T>>,
    id: string,
    find: (id: string) => Promise<T | null>,
  ): Promise<{ current: T; expectedRevision: number; before: T }> {
    const existing = staged.get(id);
    if (existing) {
      if (existing.change.op === "create") {
        throw new StagingError(`O registro ${id} foi criado nesta mesma requisição: inclua tudo na criação.`);
      }
      if (existing.change.op === "delete") {
        throw new StagingError(`O registro ${id} já está marcado para ser apagado.`);
      }
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
      // A serie alterada ou apagada leva a ocorrencia embora no mesmo lote.
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
