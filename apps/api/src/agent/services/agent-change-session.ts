import {
  AgentChatMessage,
  Note,
  Task,
  type AgentConversation,
  type Event,
  type EventItem,
  type TaskReviseChanges,
} from "@repo/entities";
import type {
  ConversationAppend,
  EntityBatch,
  EventRepository,
  NoteRepository,
  StagedChange,
  TaskRepository,
} from "@repo/entities/ports";
import type {
  AgentChatEntityRef,
  AgentEntityItem,
  CreateEventInput,
  CreateEventItemInput,
} from "@repo/entities/contracts";
import type { CreateEventUseCase } from "../../events/usecases/create-event.usecase";
import { assertParentTaskAssignable } from "../../tasks/usecases/assert-parent-task";
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
  content?: string;
  taskId?: string;
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
      notes: Pick<NoteRepository, "findById">;
    },
    private readonly createEventUseCase: Pick<CreateEventUseCase, "prepare">,
  ) {}

  createEvent(input: CreateEventInput): Promise<StageResult> {
    return this.attempt(async () => {
      const event = await this.createEventUseCase.prepare(input, { userId: this.userId });
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
    primaryType: string,
    revise: (current: Event) => Promise<Event>,
  ): Promise<StageResult> {
    return this.attempt(async () => {
      const loaded = await this.loadForChange(this.events, id, (key) => this.repositories.events.findById(key));
      const currentType = loaded.current.items.find((item) => item.isPrimary)?.type;
      if (currentType !== primaryType) {
        throw new StagingError(
          `O evento ${id} é do tipo ${currentType}, não ${primaryType}. Use a ferramenta desse tipo.`,
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

  /** Monta um item como a criacao montaria: a refeicao passa pelo modelo, o treino pelo catalogo. */
  async buildItem(item: CreateEventItemInput, startedAt: Date): Promise<EventItem> {
    const draft = await this.createEventUseCase.prepare(
      { name: "rascunho", startedAt: startedAt.toISOString(), items: [item] },
      { userId: this.userId },
    );
    return draft.items[0];
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
      const note = Note.create({ ...fields, content: fields.content, userId: this.userId });
      this.notes.set(note.id, { change: { op: "create", entity: note } });
      return { ok: true, kind: "note", op: "create", id: note.id };
    });
  }

  updateNote(id: string, fields: NoteFields): Promise<StageResult> {
    return this.attempt(async () => {
      const loaded = await this.loadForChange(this.notes, id, (key) => this.repositories.notes.findById(key));
      await this.assertNoteTargets(fields);

      const revised = loaded.current.revise(fields);
      this.notes.set(id, {
        change: { op: "update", entity: revised, expectedRevision: loaded.expectedRevision },
        before: loaded.before,
      });
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

  result(): { created: AgentEntityItem[]; updated: AgentEntityItem[]; deleted: AgentEntityItem[] } {
    const result = { created: [] as AgentEntityItem[], updated: [] as AgentEntityItem[], deleted: [] as AgentEntityItem[] };
    const collect = <T>(staged: Map<string, Staged<T>>, toItem: (entity: T) => AgentEntityItem) => {
      for (const { change, before } of staged.values()) {
        if (change.op === "create") result.created.push(toItem(change.entity));
        else if (change.op === "update") result.updated.push(toItem(change.entity));
        else if (before) result.deleted.push(toItem(before));
      }
    };
    collect(this.events, eventItem);
    collect(this.tasks, taskItem);
    collect(this.notes, noteItem);
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
