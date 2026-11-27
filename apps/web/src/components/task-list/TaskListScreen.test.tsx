import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { createFakeApi } from "@/test/fake-api";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/tasks/new-task-forms/TagInput", () => ({ TagInput: () => null }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TaskListScreen } = await import("./TaskListScreen");

/** Liga a tela à API falsa com estes tarefas e devolve a API, para conferir a rede. */
function serve(tasks: TaskDto[]) {
  const api = createFakeApi({ areas: [tasksArea], seed: { tasks: tasks } });
  net.authedFetch.mockImplementation(api.authedFetch);
  return api;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  net.authedFetch.mockReset();
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const tasks: TaskDto[] = [
  taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", startedAt: "2026-09-13T00:00:00-03:00", tags: ["casa"] }),
  taskFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "running" }),
  taskFixture({ id: "pneu", name: "Trocar o pneu", status: "inHold" }),
  taskFixture({ id: "fotos", name: "Organizar fotos da viagem", status: "toDefine" }),
  taskFixture({ id: "relatorio", name: "Enviar relatório", status: "done" }),
  taskFixture({ id: "assinatura", name: "Renovar assinatura", status: "cancel" }),
];

/** As quatro gavetas com uma tarefa de pessoa e uma de agente em cada, mais o que o agente ainda faz. */
const drawerTasks: TaskDto[] = [
  taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", startedAt: "2026-09-13T00:00:00-03:00", tags: ["casa"] }),
  taskFixture({ id: "resposta", name: "Qual hotel prefere?", actor: "agent", kind: "inquiry_request", status: "waiting" }),
  taskFixture({ id: "mestrado", name: "Projeto longo", status: "doing", longRunning: true }),
  taskFixture({ id: "backup", name: "Backup da noite", actor: "agent", kind: "cron", status: "failed" }),
  taskFixture({ id: "pneu", name: "Trocar o pneu", status: "inHold" }),
  taskFixture({ id: "guardada", name: "Resumo guardado", actor: "agent", kind: "request", status: "completed", situation: "bookmarked" }),
  taskFixture({ id: "relatorio", name: "Enviar relatório", status: "done" }),
  taskFixture({ id: "revisada", name: "Resumo revisado", actor: "agent", kind: "request", status: "completed", situation: "reviewed" }),
  taskFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "running" }),
  taskFixture({ id: "fila", name: "Montar relatório", actor: "agent", kind: "build_request", status: "queued" }),
];

test("as quatro gavetas aparecem na ordem, com a contagem, as duas primeiras abertas e as outras fechadas", async () => {
  serve(drawerTasks);
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "Para agora2",
    "Contínuas2",
    "Para depois2",
    "Finalizadas2",
  ]);
  expect(screen.getByRole("button", { name: /Para agora/ })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: /Contínuas/ })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: /Para depois/ })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: /Finalizadas/ })).toHaveAttribute("aria-expanded", "false");

  // Em cada gaveta a pessoa vem antes do agente.
  const now = screen.getByRole("region", { name: /Para agora/ });
  expect(within(now).getAllByRole("link").map((link) => link.textContent)).toEqual([expect.stringContaining("Pagar conta de luz"), expect.stringContaining("Qual hotel prefere?")]);
  expect(within(screen.getByRole("region", { name: /Contínuas/ })).getAllByRole("link").map((link) => link.textContent)).toEqual([
    expect.stringContaining("Projeto longo"),
    expect.stringContaining("Backup da noite"),
  ]);
  const luz = within(now).getByRole("link", { name: /Pagar conta de luz/ });
  expect(luz).toHaveAttribute("href", "/user-1/tarefas/luz");
  expect(within(now).getByText("Era ontem")).toBeInTheDocument();
  expect(within(now).getByText("#casa")).toBeInTheDocument();
});

test("as gavetas fechadas abrem ao toque e fecham de novo, e as abertas também fecham", async () => {
  serve(drawerTasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  const later = screen.getByRole("button", { name: /Para depois/ });
  expect(screen.queryByRole("link", { name: /Trocar o pneu/ })).not.toBeInTheDocument();
  fireEvent.click(later);
  expect(later).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: /Trocar o pneu/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Resumo guardado/ })).toBeInTheDocument();
  fireEvent.click(later);
  expect(screen.queryByRole("link", { name: /Trocar o pneu/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Finalizadas/ }));
  expect(screen.getByRole("link", { name: /Enviar relatório/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Resumo revisado/ })).toBeInTheDocument();

  const now = screen.getByRole("button", { name: /Para agora/ });
  fireEvent.click(now);
  expect(now).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link", { name: /Pagar conta de luz/ })).not.toBeInTheDocument();
});

test("a gaveta vazia não é desenhada", async () => {
  serve([taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo" })]);
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Para agora1"]);
});

test("o resumo conta as tarefas para agora", async () => {
  serve(drawerTasks);
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2 tarefas para agora");
});

test("nenhuma tarefa em andamento aparece na lista", async () => {
  serve(drawerTasks);
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  fireEvent.click(screen.getByRole("button", { name: /Para depois/ }));
  fireEvent.click(screen.getByRole("button", { name: /Finalizadas/ }));
  expect(screen.queryByRole("link", { name: /Pesquisar voos/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Montar relatório/ })).not.toBeInTheDocument();
});

const hierarchy = [
  taskFixture({ id: "proposta", name: "Revisar proposta", status: "doing", subtaskIds: ["ler", "anotar"] }),
  taskFixture({ id: "ler", name: "Ler a proposta", status: "done", parentTaskId: "proposta", revision: 4 }),
  taskFixture({ id: "anotar", name: "Anotar as dúvidas", status: "todo", parentTaskId: "proposta", revision: 2 }),
  taskFixture({ id: "rascunho", name: "Escrever o rascunho", status: "todo", parentTaskId: "fora-da-lista" }),
];

test("a subtarefa só aparece dentro da principal: a principal mostra a fração e os grupos contam só as principais", async () => {
  serve(hierarchy);
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Revisar proposta/ });
  // Nenhuma subtarefa é linha de grupo: as duas só existem dentro da gaveta da principal.
  const drawer = screen.getByRole("list", { name: "Subtarefas de “Revisar proposta”" });
  expect(screen.getAllByRole("link", { name: /Ler a proposta|Anotar as dúvidas/ }).every((link) => drawer.contains(link))).toBe(true);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2 tarefas para agora");
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Para agora2"]);

  const toggle = screen.getByRole("button", { name: "Subtarefas de “Revisar proposta”: 1 de 2 feitas" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(toggle).toHaveTextContent("1/2");
  // A principal fora da lista não segura a subtarefa: ela continua linha.
  expect(within(screen.getByRole("region", { name: /Para agora/ })).getByRole("link", { name: /Escrever o rascunho/ })).toBeInTheDocument();
});

test("a gaveta vem aberta com as subtarefas, cada uma levando ao seu detalhe, e a fração fecha e reabre", async () => {
  serve(hierarchy);
  render(<TaskListScreen userId="user-1" />);

  const toggle = await screen.findByRole("button", { name: /Subtarefas de “Revisar proposta”/ });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  // Na ordem em que a lista vem da API: a feita depois da aberta.
  const drawer = screen.getByRole("list", { name: "Subtarefas de “Revisar proposta”" });
  expect(within(drawer).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Anotar as dúvidas", "/user-1/tarefas/anotar"],
    ["Ler a proposta", "/user-1/tarefas/ler"],
  ]);

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("list", { name: "Subtarefas de “Revisar proposta”" })).not.toBeInTheDocument();

  fireEvent.click(toggle);
  expect(screen.getByRole("list", { name: "Subtarefas de “Revisar proposta”" })).toBeInTheDocument();
});

test("o glifo da subtarefa abre a mesma escolha de status e grava com a revisão dela", async () => {
  const api = serve(hierarchy);
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: glyphOf("Anotar as dúvidas") }));
  fireEvent.click(screen.getByRole("option", { name: "Feito" }));

  await waitFor(() => expect(api.calls.some((call) => call.method === "PATCH")).toBe(true));
  expect(api.calls.find((call) => call.method === "PATCH")).toMatchObject({
    pathname: "/api/tasks/anotar",
    body: { expectedRevision: 2, status: "done" },
  });
  await waitFor(() => expect(screen.getByRole("button", { name: /Subtarefas de “Revisar proposta”/ })).toHaveTextContent("2/2"));
});

test("a lista pede as tarefas acompanhadas, e não a agenda", async () => {
  const api = serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  expect(api.calls.map((call) => call.pathname)).toContain("/api/tasks/tracked");
  expect(api.calls.map((call) => call.pathname)).not.toContain("/api/tasks");
});

test("avisa quando a lista falha e recarrega ao tentar de novo", async () => {
  const api = serve(tasks);
  api.failNext("GET", "/api/tasks/tracked", 503);
  render(<TaskListScreen userId="user-1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as tarefas.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(await screen.findByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

test("convida a criar a primeira tarefa quando não há nenhuma tarefa com status, e leva ao formulário de tarefa", async () => {
  serve([]);
  render(<TaskListScreen userId="user-1" />);

  expect(await screen.findByRole("heading", { name: "Nenhuma tarefa por aqui" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
  expect(push).toHaveBeenCalledWith("/user-1/tarefas/nova");
});

const serieRule = { frequency: "daily" as const, interval: 1, timeOfDay: "18:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" };

test("uma série aparece uma vez, pela ocorrência em aberto mais próxima, com a regra no lugar do horário", async () => {
  serve([
    taskFixture({ id: "dia-14", name: "Pagar fatura", status: "todo", startedAt: "2026-09-14T18:00:00-03:00", recurrence: { id: "serie-1", occurrenceOn: "2026-09-14", detached: false, rule: serieRule } }),
    taskFixture({ id: "dia-15", name: "Pagar fatura", status: "todo", startedAt: "2026-09-15T18:00:00-03:00", recurrence: { id: "serie-1", occurrenceOn: "2026-09-15", detached: false, rule: serieRule } }),
  ]);
  render(<TaskListScreen userId="user-1" />);

  const links = await screen.findAllByRole("link", { name: /Pagar fatura/ });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "/user-1/tarefas/dia-14");
  expect(within(screen.getByRole("region", { name: /Para agora/ })).getByText("Todo dia, 18:00")).toBeInTheDocument();
});

const glyphOf = (name: string) => new RegExp(`Mudar status de “${name}”`);

test("tocar no glifo abre a escolha dos sete status, com o atual marcado, e não grava nada", async () => {
  const api = serve([taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Pagar conta de luz/ })).closest("li") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: glyphOf("Pagar conta de luz") }));

  const list = within(screen.getByRole("dialog", { name: "Status de “Pagar conta de luz”" })).getByRole("listbox", { name: "Status da tarefa" });
  expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual([
    "A fazer", "Sem data", "Em curso", "Em espera", "Feito", "Cancelado", "Não realizado",
  ]);
  expect(within(list).getByRole("option", { name: "A fazer" })).toHaveAttribute("aria-selected", "true");
  expect(within(list).getAllByRole("option", { selected: true })).toHaveLength(1);
  expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
});

test("escolher o status que a tarefa já tem, ou fechar com Esc, não grava nada", async () => {
  const api = serve([taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.click(screen.getByRole("option", { name: "A fazer" }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
});

test("escolher um status em aberto grava com a revisão lida e a linha muda de gaveta", async () => {
  const api = serve([taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.click(screen.getByRole("option", { name: "Em espera" }));

  await waitFor(() => expect(api.calls.some((call) => call.method === "PATCH")).toBe(true));
  expect(api.calls.find((call) => call.method === "PATCH")).toMatchObject({
    pathname: "/api/tasks/luz",
    body: { expectedRevision: 3, status: "inHold" },
  });
  expect(api.calls.find((call) => call.method === "PATCH")?.body).not.toHaveProperty("finishedAt");
  // Em espera cai em Para depois, que vem fechada.
  fireEvent.click(await screen.findByRole("button", { name: /Para depois/ }));
  expect(within(screen.getByRole("region", { name: /Para depois/ })).getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /Para agora/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("escolher Feito envia a conclusão com a revisão lida e a linha vai para Finalizadas", async () => {
  const api = serve([taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Pagar conta de luz/ })).closest("li") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.click(screen.getByRole("option", { name: "Feito" }));

  await waitFor(() => expect(api.calls.some((call) => call.method === "PATCH")).toBe(true));
  const patch = api.calls.find((call) => call.method === "PATCH");
  expect(patch?.pathname).toBe("/api/tasks/luz");
  // O relógio falso avança sozinho: confere o instante pelo começo (13:00 UTC = 10:00 em São Paulo).
  expect(patch?.body).toMatchObject({ expectedRevision: 3, status: "done" });
  expect((patch?.body as { finishedAt: string }).finishedAt).toMatch(/^2026-09-14T13:00:00/);

  await waitFor(() => expect(screen.queryByRole("region", { name: /Para agora/ })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Finalizadas/ }));
  expect(within(screen.getByRole("region", { name: /Finalizadas/ })).getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

test("tirar uma tarefa de Feito limpa a conclusão; reabrir um cancelado só troca o status", async () => {
  const api = serve([
    taskFixture({ id: "relatorio", name: "Enviar relatório", status: "done", revision: 4, finishedAt: "2026-09-13T15:00:00-03:00" }),
    taskFixture({ id: "assinatura", name: "Renovar assinatura", status: "cancel", revision: 2 }),
  ]);
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: /Finalizadas/ }));
  fireEvent.click(screen.getByRole("button", { name: glyphOf("Enviar relatório") }));
  fireEvent.click(screen.getByRole("option", { name: "A fazer" }));

  await waitFor(() => expect(api.calls.some((call) => call.method === "PATCH")).toBe(true));
  expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ expectedRevision: 4, status: "todo", finishedAt: null });
  await waitFor(() => expect(within(screen.getByRole("region", { name: /Para agora/ })).getByRole("link", { name: /Enviar relatório/ })).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: glyphOf("Renovar assinatura") }));
  fireEvent.click(screen.getByRole("option", { name: "Em curso" }));
  await waitFor(() => expect(api.calls.filter((call) => call.method === "PATCH")).toHaveLength(2));
  expect(api.calls.filter((call) => call.method === "PATCH")[1]?.body).toEqual({ expectedRevision: 2, status: "doing" });
});

test("o glifo de uma tarefa de agente não aparece como botão e não muda status", async () => {
  const api = serve([taskFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "waiting" })]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Pesquisar voos/ })).closest("li") as HTMLElement;
  expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
});

const reviewable = [
  taskFixture({ id: "voos", name: "Pesquisar voos", actor: "agent", kind: "request", status: "completed", situation: "to_review" }),
  taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo" }),
];

/** O glifo da esquerda de uma tarefa de agente final: abre as três situações. */
const situationButton = (name: string) => screen.findByRole("button", { name: new RegExp(`Mudar situação de “${name}”`) });
const drawerNames = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

test("tocar no glifo de uma tarefa de agente final e escolher Revisada a leva para Finalizadas, grava e continua assim ao recarregar", async () => {
  const api = serve(reviewable);
  const { unmount } = render(<TaskListScreen userId="user-1" />);

  // Para revisar fica em Para agora, com a tarefa de pessoa.
  expect(await situationButton("Pesquisar voos")).toHaveAccessibleName("Para revisar. Mudar situação de “Pesquisar voos”");
  expect(within(screen.getByRole("region", { name: /Para agora/ })).getByRole("link", { name: /Pesquisar voos/ })).toBeInTheDocument();
  fireEvent.click(await situationButton("Pesquisar voos"));
  const menu = screen.getByRole("group", { name: "Situação da tarefa" });
  expect(within(menu).getAllByRole("button").map((button) => button.textContent)).toEqual(["Para revisar", "Revisada", "Guardada"]);
  fireEvent.click(within(menu).getByRole("button", { name: "Revisada" }));

  // Na hora, sem reler: a linha sai de Para agora e entra em Finalizadas (fechada).
  expect(screen.queryByRole("link", { name: /Pesquisar voos/ })).not.toBeInTheDocument();
  expect(drawerNames()).toEqual(["Para agora1", "Finalizadas1"]);
  fireEvent.click(screen.getByRole("button", { name: /Finalizadas/ }));
  expect(await situationButton("Pesquisar voos")).toHaveAccessibleName("Revisada. Mudar situação de “Pesquisar voos”");
  await waitFor(() => expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(1));
  expect(api.calls.find((call) => call.method === "PUT")).toMatchObject({ pathname: "/api/tasks/voos/situation", body: { situation: "reviewed" } });
  expect(api.calls.filter((call) => call.pathname === "/api/tasks/tracked")).toHaveLength(1);

  unmount();
  render(<TaskListScreen userId="user-1" />);
  fireEvent.click(await screen.findByRole("button", { name: /Finalizadas/ }));
  expect(await situationButton("Pesquisar voos")).toHaveAccessibleName("Revisada. Mudar situação de “Pesquisar voos”");
});

test("escolher Guardada leva a tarefa de agente para Para depois, antes de a API responder", async () => {
  const api = serve(reviewable);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  net.authedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === "PUT") await held;
    return api.authedFetch(path, init);
  });
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await situationButton("Pesquisar voos"));
  fireEvent.click(screen.getByRole("button", { name: "Guardada" }));

  expect(screen.queryByRole("link", { name: /Pesquisar voos/ })).not.toBeInTheDocument();
  expect(drawerNames()).toEqual(["Para agora1", "Para depois1"]);
  fireEvent.click(screen.getByRole("button", { name: /Para depois/ }));
  expect(await situationButton("Pesquisar voos")).toHaveAccessibleName("Guardada. Mudar situação de “Pesquisar voos”");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("1 tarefa para agora");
  expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
  release();
  await waitFor(() => expect(api.calls.some((call) => call.method === "PUT")).toBe(true));
});

test("com a API falhando, a tarefa volta para a gaveta de antes e a tela avisa", async () => {
  const api = serve(reviewable);
  render(<TaskListScreen userId="user-1" />);
  api.failNext("PUT", "/api/tasks/voos/situation", 500);

  fireEvent.click(await situationButton("Pesquisar voos"));
  fireEvent.click(screen.getByRole("button", { name: "Revisada" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível mudar a situação");
  expect(await situationButton("Pesquisar voos")).toHaveAccessibleName("Para revisar. Mudar situação de “Pesquisar voos”");
  expect(drawerNames()).toEqual(["Para agora2"]);
});

test("a tarefa de agente esperando você e a execução agendada têm ponto inerte, sem botão", async () => {
  serve([
    taskFixture({ id: "espera", name: "Aguardando resposta", actor: "agent", kind: "request", status: "waiting" }),
    taskFixture({ id: "rotina", name: "Rotina da manhã", actor: "agent", kind: "cron", status: "completed" }),
  ]);
  render(<TaskListScreen userId="user-1" />);

  const waiting = (await screen.findByRole("link", { name: /Aguardando resposta/ })).closest("li") as HTMLElement;
  expect(within(waiting).queryByRole("button")).not.toBeInTheDocument();
  expect(waiting.querySelector("[data-row-lead]")).toBeInTheDocument();
  const cron = screen.getByRole("link", { name: /Rotina da manhã/ }).closest("li") as HTMLElement;
  expect(within(cron).queryByRole("button")).not.toBeInTheDocument();
  expect(cron.querySelector("[data-row-lead]")).toBeInTheDocument();
});

test("revisão desatualizada: a tela avisa, relê a lista e não grava nada", async () => {
  const api = serve([taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 1 })]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Pagar conta de luz/ })).closest("li") as HTMLElement;
  // Outra tela editou a tarefa depois da leitura: a revisão no servidor passa a 2.
  const table = api.store.table<TaskDto>("tasks");
  table.set("luz", { ...(table.get("luz") as TaskDto), revision: 2 });

  fireEvent.click(within(row).getByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.click(screen.getByRole("option", { name: "Feito" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Esta tarefa mudou em outro lugar");
  expect(api.calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
  expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ expectedRevision: 1 });
  expect(within(screen.getByRole("region", { name: /Para agora/ })).getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

/** Os parâmetros da última consulta à lista de tarefas, como saíram na rede. */
function lastTrackedQuery(api: ReturnType<typeof serve>): Record<string, string> {
  const tracked = api.calls.filter((call) => call.pathname === "/api/tasks/tracked");
  return tracked[tracked.length - 1]?.query ?? {};
}

test("a tag filtra pela consulta, e as outras tags continuam como opções", async () => {
  const api = serve([
    taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", tags: ["casa"] }),
    taskFixture({ id: "treino", name: "Treino de força", status: "todo", tags: ["saude"] }),
  ]);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  fireEvent.click(screen.getByRole("button", { name: "#casa" }));

  await waitFor(() => expect(lastTrackedQuery(api)).toMatchObject({ tag: "casa" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: /Treino de força/ })).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "#casa" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "#saude" })).toBeInTheDocument();
});

test("prioridade aceita mais de um nível e os manda juntos, na ordem da escala", async () => {
  const api = serve([
    taskFixture({ id: "a", name: "Urgente da casa", status: "todo", priority: "urgent" }),
    taskFixture({ id: "b", name: "Baixa do dia", status: "todo", priority: "low" }),
    taskFixture({ id: "c", name: "Média do dia", status: "todo", priority: "medium" }),
  ]);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Média do dia/ });

  fireEvent.click(screen.getByRole("button", { name: "Baixa" }));
  fireEvent.click(screen.getByRole("button", { name: "Urgente" }));

  await waitFor(() => expect(lastTrackedQuery(api)).toMatchObject({ priority: "urgent,low" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: /Média do dia/ })).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: /Urgente da casa/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Baixa do dia/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Alta" })).toHaveAttribute("aria-pressed", "false");
});

test("a busca por texto espera a digitação parar, tira os espaços das pontas e manda q", async () => {
  const api = serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tarefas" }), { target: { value: "  viagem " } });

  await waitFor(() => expect(lastTrackedQuery(api)).toMatchObject({ q: "viagem" }));
  // Sem data cai em Para depois, que vem fechada.
  fireEvent.click(await screen.findByRole("button", { name: /Para depois/ }));
  expect(await screen.findByRole("link", { name: /Organizar fotos da viagem/ })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("link", { name: /Pagar conta de luz/ })).not.toBeInTheDocument());
});

test("Limpar filtros manda a consulta sem filtro e volta à lista inteira", async () => {
  const api = serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  fireEvent.click(screen.getByRole("button", { name: "Média" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tarefas" }), { target: { value: "viagem" } });
  await waitFor(() => expect(lastTrackedQuery(api)).toMatchObject({ priority: "medium", q: "viagem" }));

  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

  await waitFor(() => expect(lastTrackedQuery(api)).toEqual({}));
  expect(screen.getByRole("searchbox", { name: "Buscar tarefas" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Média" })).toHaveAttribute("aria-pressed", "false");
  expect(await screen.findByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

test("com filtro ativo e nada encontrado, diz que nenhuma tarefa passou no filtro", async () => {
  serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tarefas" }), { target: { value: "inexistente" } });

  expect(await screen.findByRole("heading", { name: "Nenhuma tarefa passou no filtro" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Nenhuma tarefa por aqui" })).not.toBeInTheDocument();

  fireEvent.click(within(screen.getByRole("region", { name: "Lista de tarefas" })).getByRole("button", { name: "Limpar filtros" }));
  expect(await screen.findByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

/** Quantas leituras da lista de tarefas saíram para a rede até agora. */
function trackedReads(api: ReturnType<typeof serve>) {
  return () => api.calls.filter((call) => call.pathname === "/api/tasks/tracked").length;
}

test("com tarefa de agente em aberto, a lista se relê sozinha e a tarefa que terminou vai para Finalizadas", async () => {
  const api = serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  // Em andamento: fica fora da lista (só a gaveta de execução a mostra).
  expect(screen.queryByRole("link", { name: /Pesquisar voos/ })).not.toBeInTheDocument();

  const table = api.store.table<TaskDto>("tasks");
  table.set("pesquisa", { ...(table.get("pesquisa") as TaskDto), status: "completed" });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  fireEvent.click(await screen.findByRole("button", { name: /Finalizadas/ }));
  expect(within(screen.getByRole("region", { name: /Finalizadas/ })).getByRole("link", { name: /Pesquisar voos/ })).toBeInTheDocument();
});

test("sem tarefa de agente em aberto, a lista não se relê em intervalo", async () => {
  const api = serve(tasks.map((task) => (task.id === "pesquisa" ? { ...task, status: "completed" as const } : task)));
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  const reads = trackedReads(api);
  const before = reads();

  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });

  expect(reads()).toBe(before);
});

test("uma releitura que falha mantém a lista na tela, sem o aviso de erro", async () => {
  const api = serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  api.failNext("GET", "/api/tasks/tracked", 503);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

test("cada linha mostra a marca e o nome do projeto, o personal inclusive", async () => {
  serve([
    taskFixture({ id: "braid", name: "Revisar o PR", status: "todo", project: { id: "p-tp", name: "timeline_project", personal: false } }),
    taskFixture({ id: "casa", name: "Pagar a luz", status: "todo" }),
    taskFixture({ id: "voos", name: "Pesquisar voos", actor: "agent", kind: "request", status: "waiting", project: { id: "p-as", name: "agent-skills", personal: false } }),
  ]);
  const { container } = render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Revisar o PR/ });

  const lineOf = (title: RegExp) => (screen.getByRole("link", { name: title }).closest("li") as HTMLElement).querySelector("[data-project-mark]");
  expect(lineOf(/Revisar o PR/)).toHaveAccessibleName("timeline_project");
  expect(lineOf(/Revisar o PR/)).toHaveTextContent("TP");
  expect(lineOf(/Pagar a luz/)).toHaveAccessibleName("diario");
  expect(lineOf(/Pesquisar voos/)).toHaveAccessibleName("agent-skills");
  expect(container.querySelectorAll("[data-project-mark]")).toHaveLength(3);
});

test("a subtarefa cuja principal está em andamento continua como linha, e a principal não aparece", async () => {
  serve([
    taskFixture({ id: "pedido", name: "Montar a viagem", actor: "agent", kind: "request", status: "running", subtaskIds: ["reservar"] }),
    taskFixture({ id: "reservar", name: "Reservar o hotel", status: "todo", parentTaskId: "pedido" }),
  ]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Reservar o hotel/ })).closest("li") as HTMLElement;
  expect(within(screen.getByRole("region", { name: /Para agora/ })).getByRole("link", { name: /Reservar o hotel/ })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Montar a viagem/ })).not.toBeInTheDocument();
  expect(row.parentElement?.closest("li")).toBeNull();
});

test("sem nada na lista mas com o agente trabalhando, diz que nada pede atenção e não convida a criar tarefa", async () => {
  serve([taskFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "running" })]);
  render(<TaskListScreen userId="user-1" />);

  expect(await screen.findByText("Nada pede a sua atenção agora.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nenhuma tarefa para agora");
  expect(screen.queryByRole("heading", { name: "Nenhuma tarefa por aqui" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nova tarefa" })).not.toBeInTheDocument();
});
