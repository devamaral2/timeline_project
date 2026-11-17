"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { TaskDto } from "@repo/contracts";
import { BackButton, DetailFrame, DetailMessage, DetailNav } from "@/components/detail/detail-parts";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { ApiRequestError } from "@/lib/api/client-request";
import { getTask } from "@/lib/api/tasks";
import { TaskEditView } from "./TaskEditView";

type LoadState = "loading" | "ready" | "missing" | "error";

/**
 * O modo de edição da tarefa de pessoa, na rota `/tarefas/:id/editar`. Carrega
 * a tarefa e monta o formulário; Salvar e Descartar voltam para a leitura, na
 * própria rota de detalhe.
 */
export function TaskEditRoute({ userId, taskId }: { userId: string; taskId: string }) {
  const router = useMotionRouter();
  const [task, setTask] = useState<TaskDto | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
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

  /** Relê depois de uma revisão velha. Se a leitura falhar, fica a versão na tela e o que foi digitado. */
  const reload = useCallback(async () => {
    try {
      setTask(await getTask(taskId));
    } catch {
      // Sem a versão nova, a pessoa confere o que digitou e tenta salvar de novo.
    }
  }, [taskId]);

  const detailPath = `/${userId}/tarefas/${taskId}`;
  const leave = () => router.replace(detailPath);

  // Salvar volta para a leitura: a tela dela já vem carregada quando a pessoa toca.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `router` é recriado a cada render; só o caminho importa.
  useEffect(() => {
    router.prefetch(detailPath);
  }, [detailPath]);

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
  if (state === "error") return frame(<DetailMessage alert>Não foi possível carregar a tarefa. Tente novamente.</DetailMessage>);
  if (state === "loading" || !task) return frame(<DetailMessage>Carregando tarefa…</DetailMessage>);
  if (task.actor === "agent") return frame(<DetailMessage>Esta tarefa é do agente e não se edita aqui.</DetailMessage>);

  return <TaskEditView task={task} userId={userId} onReload={reload} onLeave={leave} />;
}

/** A tarefa de outro usuário responde 403 e o inexistente 404: a tela diz só que não há tarefa. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.kind === "not_found" || error.kind === "forbidden");
}
