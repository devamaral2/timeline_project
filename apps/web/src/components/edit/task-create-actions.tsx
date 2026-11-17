"use client";

import type { RequestDto, TaskDto } from "@repo/contracts";
import { LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HermesGlyph } from "@/components/ui/hermes-glyph";
import { operationId } from "@/lib/api/operation-id";
import { getRequest, startRequest } from "@/lib/api/requests";
import { createTask, getTask, newIdempotencyKey } from "@/lib/api/tasks";
import { AGENT_REQUEST_POLL_MS, isOpenRequest, runningStepLabel } from "@/lib/tasks/agent-request-model";
import styles from "./task-create-actions.module.css";

interface TaskCreateActionsProps {
  /** O texto da busca: o nome da tarefa nova, ou o pedido ao Hermes. */
  text: string;
  /** Quem pede ao Hermes. Sem ele, só a criação manual aparece. */
  userId?: string;
  /** As tarefas criadas, já lidas, para a lista ligar. O modal fecha depois. */
  onCreated: (tasks: TaskDto[]) => void;
  close: () => void;
  pollMs?: number;
}

type Phase =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "asking"; progress?: string }
  | { kind: "failed"; message: string };

const CREATE_FAILED = "Não foi possível criar a tarefa. Tente de novo.";
const ASK_FAILED = "O pedido ao Hermes falhou. Tente de novo.";
const NOTHING_CREATED = "O Hermes não criou nenhuma tarefa com esse pedido.";

/**
 * O rodapé do modal de seleção de tarefas: em vez de ligar uma tarefa que existe, criar uma nova com o texto da
 * busca. "Criar" faz a tarefa só com o nome (a fazer, tipo comum); "Pedir ao Hermes" manda o texto como pedido e
 * acompanha até ele terminar. As tarefas nascem na hora (a criação não espera o Salvar); a ligação com a tarefa
 * aberta vai para o rascunho, como uma escolha da busca. Do pedido, entram só as tarefas de cima: as que o próprio
 * pedido pôs como subtarefa de outra criada junto continuam onde ele as pôs.
 */
export function TaskCreateActions({ text, userId, onCreated, close, pollMs = AGENT_REQUEST_POLL_MS }: TaskCreateActionsProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Um toque de novo no mesmo nome, depois de uma falha, reusa a chave: a API não cria a mesma tarefa duas vezes.
  const createKey = useRef<{ name: string; key: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const busy = phase.kind === "creating" || phase.kind === "asking";
  const empty = text === "";

  function finish(tasks: TaskDto[]) {
    if (!alive.current) return;
    onCreated(tasks);
    close();
  }

  async function create() {
    if (busy || empty) return;
    if (createKey.current?.name !== text) createKey.current = { name: text, key: newIdempotencyKey() };
    setPhase({ kind: "creating" });
    try {
      const id = await createTask({ kind: "common", name: text, description: "", priority: "medium", status: "todo" }, { idempotencyKey: createKey.current.key });
      finish([await getTask(id)]);
    } catch {
      if (alive.current) setPhase({ kind: "failed", message: CREATE_FAILED });
    }
  }

  async function ask() {
    if (busy || empty || !userId) return;
    setPhase({ kind: "asking" });
    try {
      const requestId = await startRequest({ userId, text, clientMessageId: operationId() });
      let request: RequestDto = await getRequest(requestId);
      while (isOpenRequest(request.status)) {
        if (!alive.current) return;
        setPhase({ kind: "asking", progress: request.progress ?? runningStepLabel(request) });
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        if (!alive.current) return;
        request = await getRequest(requestId);
      }
      if (request.status !== "done") {
        if (alive.current) setPhase({ kind: "failed", message: request.message ?? ASK_FAILED });
        return;
      }
      const ids = request.entities.filter((entity) => entity.kind === "task" && entity.operation === "create").map((entity) => entity.id);
      const tasks = await Promise.all(ids.map((id) => getTask(id)));
      const created = new Set(ids);
      const top = tasks.filter((task) => !task.parentTaskId || !created.has(task.parentTaskId));
      if (top.length === 0) {
        if (alive.current) setPhase({ kind: "failed", message: request.message ?? NOTHING_CREATED });
        return;
      }
      finish(top);
    } catch {
      if (alive.current) setPhase({ kind: "failed", message: ASK_FAILED });
    }
  }

  return (
    <div className={styles.actions}>
      <button type="button" className={styles.action} disabled={busy || empty} onClick={() => void create()}>
        {phase.kind === "creating" ? <LoaderCircle className={`${styles.icon} ${styles.spin}`} aria-hidden /> : <Plus className={styles.icon} aria-hidden />}
        <span className={styles.label}>{empty ? "Criar tarefa" : `Criar “${text}”`}</span>
      </button>
      {userId ? (
        <button type="button" className={styles.action} disabled={busy || empty} onClick={() => void ask()}>
          {phase.kind === "asking" ? <LoaderCircle className={`${styles.icon} ${styles.spin}`} aria-hidden /> : <HermesGlyph className={styles.icon} />}
          <span className={styles.label}>Pedir ao Hermes</span>
        </button>
      ) : null}
      {empty && !busy ? <p className={styles.hint}>Escreva na busca o nome da tarefa nova ou o pedido ao Hermes.</p> : null}
      {phase.kind === "asking" ? <p role="status" className={styles.hint}>{phase.progress ?? "O Hermes está criando…"}</p> : null}
      {phase.kind === "failed" ? <p role="alert" className={styles.hint} data-alert>{phase.message}</p> : null}
    </div>
  );
}
