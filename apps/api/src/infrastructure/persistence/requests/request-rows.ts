import { monotonicFactory } from "ulid";
import type { AgentTaskKind, AgentTaskStatus, EntryKind, EntryRole } from "../../../domain";
import { taskEntries, tasks } from "../database/tables";
import { NOW } from "../sqlite/sql";
import { resolveProjectId, type ProjectScope } from "../projects/resolve-project";
import type { Tx } from "../shared/tx";

/**
 * Monotonico: as entradas de uma tarefa e os passos de um pedido ordenam por id
 * na ordem em que foram criados, mesmo no mesmo milissegundo.
 */
export const newOrderedId = monotonicFactory();

/** Por onde o pedido anda; fica em `tasks.data.route`. */
export type RequestRoute = "steps" | "hermes" | "model" | "voice" | "food";

export interface NewAgentTask {
  id: string;
  userId: string;
  kind: AgentTaskKind;
  status: AgentTaskStatus;
  name: string;
  /** Pequeno: a rota do pedido, o agente interno do passo, o contexto de tela. */
  data: Record<string, unknown>;
  /** O que decide o projeto da tarefa alem do dono: o projeto pedido, o pedido de que ela e passo, a sessao, o alvo. */
  project?: ProjectScope;
}

/** Um pedido ou um passo: tarefa de agente. Comeca agora; a conclusao vem quando ele termina. */
export async function insertAgentTask(tx: Tx, task: NewAgentTask): Promise<void> {
  const projectId = await resolveProjectId(tx, { ...task.project, userId: task.userId });
  await tx.execute(
    tasks.insert({
      id: task.id,
      userId: task.userId,
      projectId,
      actor: "agent",
      kind: task.kind,
      status: task.status,
      name: task.name,
      data: task.data,
      startedAt: NOW,
    }),
  );
}

export interface NewEntry {
  taskId: string;
  userId: string;
  kind: EntryKind;
  /** So em `message`. */
  role?: EntryRole;
  /** Ausente em `trace`, que guarda so numeros e codigos em `data`. */
  content?: string;
  data?: Record<string, unknown>;
}

/** Acrescenta uma entrada à tarefa. Entradas nunca mudam, e nao contam como revisao da tarefa. */
export async function appendEntry(tx: Pick<Tx, "execute">, entry: NewEntry): Promise<string> {
  const id = newOrderedId();
  await tx.execute(
    taskEntries.insert({
      id,
      taskId: entry.taskId,
      userId: entry.userId,
      kind: entry.kind,
      role: entry.role ?? null,
      content: entry.content ?? null,
      data: entry.data ?? {},
    }),
  );
  return id;
}
