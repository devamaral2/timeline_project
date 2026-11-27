import type { RequestDto } from "@repo/contracts";
import { expect, test } from "vitest";
import { pendingStepLabel } from "./pending-step";
import type { AgentChatMessage } from "./use-agent-chat";

const pending = { id: "m1", label: "Realizando processos", requestId: "r1" };

function process(steps: RequestDto["steps"]): AgentChatMessage {
  return {
    id: "m1-process", role: "process",
    request: {
      id: "r1", kind: "request", route: "steps", status: "running", title: "Criar",
      project: { id: "project-1", name: "personal", personal: true },
      createdAt: "2026-11-14T12:00:00.000Z", updatedAt: "2026-11-14T12:00:01.000Z", steps, entities: [],
    },
  };
}

test("antes de o servidor desdobrar o pedido, a linha diz que ele está sendo entendido", () => {
  expect(pendingStepLabel([{ id: "m1-process", role: "process", request: null }], pending)).toBe("Entendendo o pedido");
  expect(pendingStepLabel([process([])], pending)).toBe("Entendendo o pedido");
});

test("no pedido por passos vale o passo que roda, senão o próximo da fila, senão o último", () => {
  const done = { id: "1", agent: "task-create", label: "Criando tarefas", status: "done" as const };
  const running = { id: "2", agent: "note-create", label: "Criando notas", status: "running" as const };
  const queued = { id: "3", agent: "task-edit", label: "Editando tarefas", status: "queued" as const };
  expect(pendingStepLabel([process([done, running, queued])], pending)).toBe("Criando notas");
  expect(pendingStepLabel([process([done, queued])], pending)).toBe("Editando tarefas");
  expect(pendingStepLabel([process([done])], pending)).toBe("Criando tarefas");
});

test("no Hermes e no modelo vale a ferramenta ou o pensamento em curso, senão o último", () => {
  const steps = (last: "running" | "done"): AgentChatMessage => ({
    id: "m1-steps", role: "hermes-steps", running: true,
    steps: [
      { id: "a", kind: "thought", label: "Pensou", status: "done" },
      { id: "b", kind: "tool", label: "Executou um comando", status: last },
    ],
  });
  expect(pendingStepLabel([steps("running")], { ...pending, label: "Hermes" })).toBe("Executou um comando");
  expect(pendingStepLabel([steps("done")], { ...pending, label: "Hermes" })).toBe("Executou um comando");
});

test("sem passo nenhum fica o rótulo do pedido, e só os passos do pedido em andamento contam", () => {
  const other: AgentChatMessage = { id: "m0-steps", role: "hermes-steps", running: false, steps: [{ id: "a", kind: "tool", label: "Buscou na web", status: "done" }] };
  expect(pendingStepLabel([other], { ...pending, label: "Haiku 5.5" })).toBe("Haiku 5.5");
  expect(pendingStepLabel([], { id: "m1" })).toBe("Pensando");
});
