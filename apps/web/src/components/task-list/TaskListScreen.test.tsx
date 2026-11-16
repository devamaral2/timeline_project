import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/tasks/new-task-forms/TagInput", () => ({ TagInput: () => null }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TaskListScreen } = await import("./TaskListScreen");

/** Liga a tela à API falsa com estes eventos e devolve a API, para conferir a rede. */
function serve(tasks: TaskDto[]) {
  const api = createFakeApi({ areas: [eventsArea], seed: { events: tasks } });
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
  eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", startedAt: "2026-09-13T00:00:00-03:00", tags: ["casa"] }),
  eventFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "running" }),
  eventFixture({ id: "pneu", name: "Trocar o pneu", status: "inHold" }),
  eventFixture({ id: "fotos", name: "Organizar fotos da viagem", status: "toDefine" }),
  eventFixture({ id: "relatorio", name: "Enviar relatório", status: "done" }),
  eventFixture({ id: "assinatura", name: "Renovar assinatura", status: "cancel" }),
];

test("agrupa pessoa e agente nos grupos do canvas, com a contagem e a linha de cada evento", async () => {
  serve(tasks);
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("4 tarefas abertas");
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "Em curso1",
    "A fazer1",
    "Sem data1",
    "Em espera1",
    "Feitas1",
    "Encerradas1",
  ]);

  const doing = screen.getByRole("region", { name: /Em curso/ });
  const agent = within(doing).getByRole("link", { name: /Pesquisar voos/ }).closest("li") as HTMLElement;
  expect(agent).toHaveAttribute("data-actor", "agent");

  const todo = screen.getByRole("region", { name: /A fazer/ });
  const luz = within(todo).getByRole("link", { name: /Pagar conta de luz/ });
  expect(luz).toHaveAttribute("href", "/user-1/eventos/luz");
  expect(within(todo).getByText("Era ontem")).toBeInTheDocument();
  expect(within(todo).getByText("#casa")).toBeInTheDocument();

  expect(within(screen.getByRole("region", { name: /Sem data/ })).getByRole("link", { name: /Organizar fotos da viagem/ })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: /Em espera/ })).getByRole("link", { name: /Trocar o pneu/ })).toBeInTheDocument();
});

test("Feitas e Encerradas vêm recolhidas e abrem ao toque", async () => {
  serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  const closed = screen.getByRole("button", { name: /Feitas/ });
  expect(closed).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link", { name: /Enviar relatório/ })).not.toBeInTheDocument();

  fireEvent.click(closed);
  expect(closed).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: /Enviar relatório/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Encerradas/ }));
  expect(screen.getByRole("link", { name: /Renovar assinatura/ })).toBeInTheDocument();
});

test("a sequência não esconde linhas: o evento que se segue a outro da lista aparece, sem fração nem “Espera por”", async () => {
  serve([
    eventFixture({ id: "proposta", name: "Revisar proposta", status: "doing", nextTaskIds: ["ler"] }),
    eventFixture({ id: "ler", name: "Ler a proposta", status: "todo", previousTaskIds: ["proposta"] }),
    eventFixture({ id: "pneu", name: "Trocar o pneu", status: "inHold", previousTaskIds: ["proposta"] }),
  ]);
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Revisar proposta/ });
  expect(screen.getByRole("link", { name: /Ler a proposta/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Trocar o pneu/ })).toBeInTheDocument();
  expect(screen.queryByText(/\d\/\d/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Espera por/)).not.toBeInTheDocument();
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

test("convida a criar o primeiro evento quando não há nenhum evento com status, e leva ao formulário de evento", async () => {
  serve([]);
  render(<TaskListScreen userId="user-1" />);

  expect(await screen.findByRole("heading", { name: "Nenhuma tarefa por aqui" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Novo evento" }));
  expect(push).toHaveBeenCalledWith("/user-1/eventos/novo");
});

const serieRule = { frequency: "daily" as const, interval: 1, timeOfDay: "18:00", timeZone: "America/Sao_Paulo", startsOn: "2026-09-01" };

test("uma série aparece uma vez, pela ocorrência em aberto mais próxima, com a regra no lugar do horário", async () => {
  serve([
    eventFixture({ id: "dia-14", name: "Pagar fatura", status: "todo", startedAt: "2026-09-14T18:00:00-03:00", recurrence: { id: "serie-1", occurrenceOn: "2026-09-14", detached: false, rule: serieRule } }),
    eventFixture({ id: "dia-15", name: "Pagar fatura", status: "todo", startedAt: "2026-09-15T18:00:00-03:00", recurrence: { id: "serie-1", occurrenceOn: "2026-09-15", detached: false, rule: serieRule } }),
  ]);
  render(<TaskListScreen userId="user-1" />);

  const links = await screen.findAllByRole("link", { name: /Pagar fatura/ });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "/user-1/eventos/dia-14");
  expect(within(screen.getByRole("region", { name: /A fazer/ })).getByText("Todo dia, 18:00")).toBeInTheDocument();
});

const glyphOf = (name: string) => new RegExp(`Mudar status de “${name}”`);

test("tocar no glifo abre a escolha dos sete status, com o atual marcado, e não grava nada", async () => {
  const api = serve([eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Pagar conta de luz/ })).closest("li") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: glyphOf("Pagar conta de luz") }));

  const list = within(screen.getByRole("dialog", { name: "Status de “Pagar conta de luz”" })).getByRole("listbox", { name: "Status do evento" });
  expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual([
    "A fazer", "Sem data", "Em curso", "Em espera", "Feito", "Cancelado", "Não realizado",
  ]);
  expect(within(list).getByRole("option", { name: "A fazer" })).toHaveAttribute("aria-selected", "true");
  expect(within(list).getAllByRole("option", { selected: true })).toHaveLength(1);
  expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
});

test("escolher o status que a tarefa já tem, ou fechar com Esc, não grava nada", async () => {
  const api = serve([eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.click(screen.getByRole("option", { name: "A fazer" }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
});

test("escolher um status em aberto grava com a revisão lida e a linha muda de grupo", async () => {
  const api = serve([eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.click(screen.getByRole("option", { name: "Em espera" }));

  await waitFor(() => expect(api.calls.some((call) => call.method === "PATCH")).toBe(true));
  expect(api.calls.find((call) => call.method === "PATCH")).toMatchObject({
    pathname: "/api/tasks/luz",
    body: { expectedRevision: 3, status: "inHold" },
  });
  expect(api.calls.find((call) => call.method === "PATCH")?.body).not.toHaveProperty("finishedAt");
  await waitFor(() => expect(within(screen.getByRole("region", { name: /Em espera/ })).getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument());
  expect(screen.queryByRole("region", { name: /A fazer/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("escolher Feito envia a conclusão com a revisão lida e a linha vai para Feitas", async () => {
  const api = serve([eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 3 })]);
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

  await waitFor(() => expect(screen.queryByRole("region", { name: /A fazer/ })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Feitas/ }));
  expect(within(screen.getByRole("region", { name: /Feitas/ })).getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

test("tirar um evento de Feito limpa a conclusão; reabrir um cancelado só troca o status", async () => {
  const api = serve([
    eventFixture({ id: "relatorio", name: "Enviar relatório", status: "done", revision: 4, finishedAt: "2026-09-13T15:00:00-03:00" }),
    eventFixture({ id: "assinatura", name: "Renovar assinatura", status: "cancel", revision: 2 }),
  ]);
  render(<TaskListScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: /Feitas/ }));
  fireEvent.click(screen.getByRole("button", { name: glyphOf("Enviar relatório") }));
  fireEvent.click(screen.getByRole("option", { name: "A fazer" }));

  await waitFor(() => expect(api.calls.some((call) => call.method === "PATCH")).toBe(true));
  expect(api.calls.find((call) => call.method === "PATCH")?.body).toEqual({ expectedRevision: 4, status: "todo", finishedAt: null });
  await waitFor(() => expect(within(screen.getByRole("region", { name: /A fazer/ })).getByRole("link", { name: /Enviar relatório/ })).toBeInTheDocument());

  fireEvent.click(screen.getByRole("button", { name: /Encerradas/ }));
  fireEvent.click(screen.getByRole("button", { name: glyphOf("Renovar assinatura") }));
  fireEvent.click(screen.getByRole("option", { name: "Em curso" }));
  await waitFor(() => expect(api.calls.filter((call) => call.method === "PATCH")).toHaveLength(2));
  expect(api.calls.filter((call) => call.method === "PATCH")[1]?.body).toEqual({ expectedRevision: 2, status: "doing" });
});

test("o glifo de um evento de agente não aparece como botão e não muda status", async () => {
  const api = serve([eventFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "running" })]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Pesquisar voos/ })).closest("li") as HTMLElement;
  expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  expect(api.calls.some((call) => call.method === "PATCH")).toBe(false);
});

test("revisão desatualizada: a tela avisa, relê a lista e não grava nada", async () => {
  const api = serve([eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", revision: 1 })]);
  render(<TaskListScreen userId="user-1" />);

  const row = (await screen.findByRole("link", { name: /Pagar conta de luz/ })).closest("li") as HTMLElement;
  // Outra tela editou a tarefa depois da leitura: a revisão no servidor passa a 2.
  const table = api.store.table<TaskDto>("events");
  table.set("luz", { ...(table.get("luz") as TaskDto), revision: 2 });

  fireEvent.click(within(row).getByRole("button", { name: glyphOf("Pagar conta de luz") }));
  fireEvent.click(screen.getByRole("option", { name: "Feito" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Esta tarefa mudou em outro lugar");
  expect(api.calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
  expect(api.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ expectedRevision: 1 });
  expect(within(screen.getByRole("region", { name: /A fazer/ })).getByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

/** Os parâmetros da última consulta à lista de tarefas, como saíram na rede. */
function lastTrackedQuery(api: ReturnType<typeof serve>): Record<string, string> {
  const tracked = api.calls.filter((call) => call.pathname === "/api/tasks/tracked");
  return tracked[tracked.length - 1]?.query ?? {};
}

test("a tag filtra pela consulta, e as outras tags continuam como opções", async () => {
  const api = serve([
    eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", tags: ["casa"] }),
    eventFixture({ id: "treino", name: "Treino de força", status: "todo", tags: ["saude"] }),
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
    eventFixture({ id: "a", name: "Urgente da casa", status: "todo", priority: "urgent" }),
    eventFixture({ id: "b", name: "Baixa do dia", status: "todo", priority: "low" }),
    eventFixture({ id: "c", name: "Média do dia", status: "todo", priority: "medium" }),
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

test("com filtro ativo e nada encontrado, diz que nenhum evento passou no filtro", async () => {
  serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tarefas" }), { target: { value: "inexistente" } });

  expect(await screen.findByRole("heading", { name: "Nenhum evento passou no filtro" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Nenhuma tarefa por aqui" })).not.toBeInTheDocument();

  fireEvent.click(within(screen.getByRole("region", { name: "Lista de tarefas" })).getByRole("button", { name: "Limpar filtros" }));
  expect(await screen.findByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

/** Quantas leituras da lista de tarefas saíram para a rede até agora. */
function trackedReads(api: ReturnType<typeof serve>) {
  return () => api.calls.filter((call) => call.pathname === "/api/tasks/tracked").length;
}

test("com evento de agente em aberto, a lista se relê sozinha e a linha vai para Feitas", async () => {
  const api = serve(tasks);
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pesquisar voos/ });

  const table = api.store.table<TaskDto>("events");
  table.set("pesquisa", { ...(table.get("pesquisa") as TaskDto), status: "done" });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  await waitFor(() => expect(screen.queryByRole("region", { name: /Em curso/ })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Feitas/ }));
  expect(within(screen.getByRole("region", { name: /Feitas/ })).getByRole("link", { name: /Pesquisar voos/ })).toBeInTheDocument();
});

test("sem evento de agente em aberto, a lista não se relê em intervalo", async () => {
  const api = serve(tasks.map((task) => (task.id === "pesquisa" ? { ...task, status: "done" as const } : task)));
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
  await screen.findByRole("link", { name: /Pesquisar voos/ });

  api.failNext("GET", "/api/tasks/tracked", 503);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Pesquisar voos/ })).toBeInTheDocument();
});
