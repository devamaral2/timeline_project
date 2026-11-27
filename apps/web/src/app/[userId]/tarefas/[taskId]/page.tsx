"use client";

import type { TaskDto } from "@repo/contracts";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { BackButton, DetailFrame, DetailMessage, DetailNav } from "@/components/detail/detail-parts";
import { AgentTaskDetailView } from "@/components/task-detail/AgentTaskDetailView";
import { TaskDetailView } from "@/components/task-detail/TaskDetailView";
import { ApiRequestError } from "@/lib/api/client-request";
import { getTask } from "@/lib/api/tasks";
import { usePullRefresh } from "@/lib/navigation/pull-refresh";

type LoadState = "loading" | "ready" | "missing" | "error";

const REFRESH_FAILURE_MESSAGE = "Não foi possível atualizar a tarefa. Tente novamente.";

/** A única rota de detalhe de tarefa: a agenda e a lista de tarefas abrem aqui. */
export default function TaskPage({ params }: { params: Promise<{ userId: string; taskId: string }> }) {
  const router = useMotionRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  /** O aviso de um puxão que falhou: a tarefa fica na tela. */
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

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
    setRefreshNotice(null);
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
      setState("ready");
      setRefreshNotice(null);
    } catch (error) {
      setState(isMissing(error) ? "missing" : "error");
    }
  }, [taskId]);

  /**
   * Puxar a tela para baixo relê a tarefa e, na tarefa de agente, o pedido (`alsoRead`). A falha não joga fora o
   * que está na tela: fica o aviso, e o que foi digitado continua lá. Só a tarefa que deixou de existir troca a
   * tela. Na tela de erro, é o jeito de tentar de novo.
   */
  const pull = useCallback(async (alsoRead?: () => Promise<void>) => {
    if (!taskId) return;
    const [read, extra] = await Promise.allSettled([getTask(taskId), alsoRead?.()]);
    if (read.status === "fulfilled") {
      setTask(read.value);
      setState("ready");
    } else if (isMissing(read.reason)) {
      setState("missing");
      return;
    } else {
      setState((current) => (current === "ready" ? current : "error"));
    }
    setRefreshNotice(read.status === "rejected" || extra.status === "rejected" ? REFRESH_FAILURE_MESSAGE : null);
  }, [taskId]);

  // A tarefa de agente publica o puxão dela, que traz também o pedido.
  usePullRefresh(() => pull(), Boolean(taskId) && task?.actor !== "agent");

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

  if (task.actor === "agent") return <AgentTaskDetailView userId={userId} task={task} onChanged={reload} onPull={pull} notice={refreshNotice} />;
  return <TaskDetailView userId={userId} task={task} onChanged={reload} notice={refreshNotice} />;
}

/** A tarefa de outro usuário responde 403 e o inexistente 404: a tela diz só que não há tarefa. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
