/**
 * Fixtures da gaveta de execução (ticket 67): as respostas de `GET /api/tasks/tracked` com tarefas de agente em
 * andamento, validadas pelo schema do contrato, e as saídas das funções do web que decidem o que a gaveta mostra
 * (`executionRunsOf`, `shownRowCount`, `drawerGrows`).
 */
import { taskCardSchema } from "../../../packages/contracts/src/schemas";
import { drawerGrows, executionRunsOf, shownRowCount, EXECUTION_PEEK, type ExecutionDrawerMode } from "../../../apps/web/src/lib/tasks/execution-runs";
import { AGENT_SKILLS_PROJECT, PERSONAL_PROJECT, TIMELINE_PROJECT } from "./project";

type CardInput = Record<string, unknown> & { id: string; name: string };

function card(input: CardInput) {
  return taskCardSchema.parse({
    actor: "agent",
    kind: "request",
    priority: "medium",
    description: "",
    project: PERSONAL_PROJECT,
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-14T14:00:00.000Z",
    updatedAt: "2026-09-14T14:00:00.000Z",
    ...input,
  });
}

/**
 * O que a lista de acompanhadas devolve com agentes ativos, fora da ordem de propósito: cinco execuções em andamento
 * (uma de cada status do grupo, com projetos diferentes), mais o que a gaveta não mostra (um passo, uma execução
 * agendada, um pedido esperando a pessoa, um concluído e uma tarefa de pessoa).
 */
const mixed = [
  card({ id: "run-old", name: "Montar relatório", kind: "build_request", status: "queued", startedAt: "2026-09-14T14:10:00.000Z", project: TIMELINE_PROJECT }),
  card({ id: "run-newest", name: "Buscar passagens", kind: "search_request", status: "running", startedAt: "2026-09-14T14:58:00.000Z", project: AGENT_SKILLS_PROJECT }),
  card({ id: "step-1", name: "Passo: abrir o site", kind: "step", status: "running", startedAt: "2026-09-14T14:59:00.000Z" }),
  card({ id: "run-mid", name: "Resumir os e-mails da semana", kind: "request", status: "starting", startedAt: "2026-09-14T14:40:00.000Z" }),
  card({ id: "cron-1", name: "Backup diário", kind: "cron", status: "running", startedAt: "2026-09-14T14:30:00.000Z" }),
  card({ id: "run-preparing", name: "Entender o pedido", kind: "request", status: "preparing", startedAt: "2026-09-14T14:50:00.000Z" }),
  card({ id: "waiting-1", name: "Qual hotel prefere?", kind: "inquiry_request", status: "waiting", startedAt: "2026-09-14T14:55:00.000Z" }),
  card({ id: "done-1", name: "Resumo pronto", kind: "review_request", status: "completed", startedAt: "2026-09-14T13:00:00.000Z" }),
  card({ id: "run-nostart", name: "Sem início ainda", kind: "request", status: "queued" }),
  card({ id: "human-1", name: "Revisar contrato", actor: "human", kind: "common", status: "doing", startedAt: "2026-09-14T14:00:00.000Z" }),
];

/** A mesma lista depois de a execução mais recente terminar. */
const afterFinish = mixed.map((item) => (item.id === "run-newest" ? card({ ...item, status: "completed" }) : item));

/** Só uma execução em andamento. */
const single = [card({ id: "run-only", name: "Buscar passagens", kind: "search_request", status: "running", startedAt: "2026-09-14T14:58:00.000Z" })];

const MODES: ExecutionDrawerMode[] = ["one", "three", "all"];

export function executionFixtures(): Record<string, unknown> {
  return {
    "execution-list-mixed": mixed,
    "execution-list-finished": afterFinish,
    "execution-list-single": single,
    "execution-list-empty": [],
    /** As regras da gaveta, calculadas pelas funções do web sobre as listas acima. */
    "execution-rules": {
      peek: EXECUTION_PEEK,
      cases: {
        mixed: { input: "execution-list-mixed", runs: executionRunsOf(mixed).map((item) => item.id) },
        finished: { input: "execution-list-finished", runs: executionRunsOf(afterFinish).map((item) => item.id) },
        single: { input: "execution-list-single", runs: executionRunsOf(single).map((item) => item.id) },
        empty: { input: "execution-list-empty", runs: executionRunsOf([]).map((item) => item.id) },
      },
      shown: [0, 1, 2, 3, 4, 5, 9].flatMap((total) => MODES.map((mode) => ({ mode, total, shown: shownRowCount(mode, total) }))),
      grows: MODES.flatMap((from) => MODES.map((to) => ({ from, to, grows: drawerGrows(from, to) }))),
    },
  };
}
