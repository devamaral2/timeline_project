import { sql } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import type { AgentEventKind, AgentEventStatus, EntryKind, EntryRole } from "../../../domain";
import * as schema from "../database/schema";
import type { Tx } from "../shared/tx";

/**
 * Monotonico: as entradas de um evento e os passos de um pedido ordenam por id
 * na ordem em que foram criados, mesmo no mesmo milissegundo.
 */
export const newOrderedId = monotonicFactory();

/** Por onde o pedido anda; fica em `events.data.route`. */
export type RequestRoute = "steps" | "hermes" | "voice" | "food";

export interface NewAgentEvent {
  id: string;
  userId: string;
  kind: AgentEventKind;
  status: AgentEventStatus;
  name: string;
  /** Pequeno: a rota do pedido, o agente interno do passo, o contexto de tela. */
  data: Record<string, unknown>;
}

/** Um pedido ou um passo: evento de agente. Comeca agora; a conclusao vem quando ele termina. */
export async function insertAgentEvent(tx: Tx, event: NewAgentEvent): Promise<void> {
  await tx.insert(schema.events).values({
    id: event.id,
    userId: event.userId,
    actor: "agent",
    kind: event.kind,
    status: event.status,
    name: event.name,
    data: event.data,
    startedAt: sql`now()`,
  });
}

export interface NewEntry {
  eventId: string;
  userId: string;
  kind: EntryKind;
  /** So em `message`. */
  role?: EntryRole;
  /** Ausente em `trace`, que guarda so numeros e codigos em `data`. */
  content?: string;
  data?: Record<string, unknown>;
}

/** Acrescenta uma entrada ao evento. Entradas nunca mudam, e nao contam como revisao do evento. */
export async function appendEntry(tx: Pick<Tx, "insert">, entry: NewEntry): Promise<string> {
  const id = newOrderedId();
  await tx.insert(schema.eventEntries).values({
    id,
    eventId: entry.eventId,
    userId: entry.userId,
    kind: entry.kind,
    role: entry.role ?? null,
    content: entry.content ?? null,
    data: entry.data ?? {},
  });
  return id;
}
