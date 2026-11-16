"use client";

import type { TaskDto } from "@repo/contracts";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { BackButton, DetailFrame, DetailMessage, DetailNav } from "@/components/detail/detail-parts";
import { AgentTaskDetailView } from "@/components/task-detail/AgentTaskDetailView";
import { TaskDetailView } from "@/components/task-detail/TaskDetailView";
import { ApiRequestError } from "@/lib/api/client-request";
import { getTask } from "@/lib/api/tasks";

type LoadState = "loading" | "ready" | "missing" | "error";

/** A única rota de detalhe de tarefa: a agenda e a lista de tarefas abrem aqui. */
export default function TaskPage({ params }: { params: Promise<{ userId: string; taskId: string }> }) {
  const router = useMotionRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    void params.then(({ userId: nextUserId, taskId: nextTaskId }) => {
      if (!cancelled) {
        setUserId(nextUserId);
        setTaskId(nextTaskId);
      }
    });
    return () => { cancelled = true; };
  }, [params]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setState("loading");
    getTask(taskId).then(
      (loaded) => {
        if (cancelled) return;
        setTask(loaded);
        setState("ready");
      },
      (error: unknown) => {
        if (!cancelled) setState(isMissing(error) ? "missing" : "error");
      },
    );
    return () => { cancelled = true; };
  }, [taskId]);

  /** Relê a tarefa depois de uma troca. Falha de leitura vira a tela de erro. */
  const reload = useCallback(async () => {
    if (!taskId) return;
    try {
      setTask(await getTask(taskId));
    } catch (error) {
      setState(isMissing(error) ? "missing" : "error");
    }
  }, [taskId]);

  function frame(children: ReactNode) {
    return (
      <DetailFrame
        leadLabel="Resumo da tarefa"
        bodyLabel="Conteúdo da tarefa"
        lead={<DetailNav label="Navegação do registro" back={<BackButton onClick={() => router.back()}>Voltar</BackButton>} />}
      >
        {children}
      </DetailFrame>
    );
  }

  if (state === "missing") return frame(<DetailMessage alert>Tarefa não encontrada.</DetailMessage>);
  if (state === "error" || (state === "ready" && !task)) {
    return frame(<DetailMessage alert>Não foi possível carregar a tarefa. Tente novamente.</DetailMessage>);
  }
  if (state === "loading" || !task || !userId) return frame(<DetailMessage>Carregando tarefa…</DetailMessage>);

  if (task.actor === "agent") return <AgentTaskDetailView userId={userId} task={task} onChanged={reload} />;
  return <TaskDetailView userId={userId} task={task} onChanged={reload} />;
}

/** A tarefa de outro usuário responde 403 e o inexistente 404: a tela diz só que não há tarefa. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
