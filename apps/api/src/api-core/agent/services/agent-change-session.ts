import {
  AgentChatMessage,
  Note,
  Task,
  type AgentConversation,
  type Event,
  type EventKind,
  type TaskReviseChanges,
} from "../../../domain";
import type {
  ConversationAppend,
  EntityBatch,
  EventRepository,
  NoteRepository,
  StagedChange,
  TaskRepository,
} from "../../../domain/ports";
import type {
  AgentChatEntityRef,
  AgentEntityItem,
  CreateEventInput,
  CreateNoteInput,
} from "@repo/contracts";
import type { CreateEventUseCase } from "../../events/create-event.usecase";
import { assertParentTaskAssignable } from "../../tasks/assert-parent-task";
import { eventItem, noteItem, taskItem } from "./agent-entity-dto";

export type EntityKind = "event" | "task" | "note";

export type StageResult =
  | { ok: true; kind: EntityKind; op: "create" | "update" | "delete"; id: string }
  | { ok: false; error: string };

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
  private conversationTurn: ConversationAppend | undefined;

  constructor(
    readonly userId: string,
    private readonly repositories: {
      events: Pick<EventRepository, "findById">;
      tasks: Pick<TaskRepository, "findById">;
      notes: Pick<NoteRepository, "findById" | "findByIds">;
    },
    private readonly createEventUseCase: Pick<CreateEventUseCase, "prepare" | "buildNote">,
  ) {}

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
    return this.attempt(async () => {
      const created = this.events.get(id);
      if (created?.change.op === "create") {
        const current = created.change.entity;
        if (current.kind !== kind) throw new StagingError(`O evento ${id} é do tipo ${current.kind}, não ${kind}.`);
        this.events.set(id, { change: { op: "create", entity: await revise(current) } });
        return { ok: true, kind: "event", op: "create", id };
      }
      const loaded = await this.loadForChange(this.events, id, (key) => this.repositories.events.findById(key));
      if (loaded.current.kind !== kind) {
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

  delete(kind: EntityKind, id: string): Promise<StageResult> {
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
    return this.events.size + this.tasks.size + this.notes.size > 0;
  }

  stagedEvent(id: string): Event | undefined {
    const entry = this.events.get(id);
    return entry?.change.op === "delete" ? undefined : entry?.change.entity;
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
    return {
      userId: this.userId,
      events: changes(this.events),
      tasks: changes(this.tasks),
      notes: changes(this.notes),
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
