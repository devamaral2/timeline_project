import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDto } from "@repo/contracts";
import { createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/events/new-event-forms/TagInput", () => ({ TagInput: () => null }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TasksScreen } = await import("./TasksScreen");

/** Liga a tela à API falsa com estes eventos e devolve a API, para conferir a rede. */
function serve(events: EventDto[]) {
  const api = createFakeApi({ areas: [eventsArea], seed: { events } });
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

const events: EventDto[] = [
  eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", startedAt: "2026-09-13T00:00:00-03:00", tags: ["casa"] }),
  eventFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "running" }),
  eventFixture({ id: "pneu", name: "Trocar o pneu", status: "inHold" }),
  eventFixture({ id: "fotos", name: "Organizar fotos da viagem", status: "toDefine" }),
  eventFixture({ id: "relatorio", name: "Enviar relatório", status: "done" }),
  eventFixture({ id: "assinatura", name: "Renovar assinatura", status: "cancel" }),
];

test("agrupa pessoa e agente nos grupos do canvas, com a contagem e a linha de cada evento", async () => {
  serve(events);
  render(<TasksScreen userId="user-1" />);

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
  serve(events);
  render(<TasksScreen userId="user-1" />);
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

test("a subtarefa cujo pai está na lista não aparece como linha própria", async () => {
  serve([
    eventFixture({ id: "proposta", name: "Revisar proposta", status: "doing" }),
    eventFixture({ id: "ler", name: "Ler a proposta", status: "todo", parentEventIds: ["proposta"] }),
  ]);
  render(<TasksScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Revisar proposta/ });
  expect(screen.queryByRole("link", { name: /Ler a proposta/ })).not.toBeInTheDocument();
});

test("a lista pede a rota de eventos com status, sem o contrato antigo", async () => {
  const api = serve(events);
  render(<TasksScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  expect(api.calls.map((call) => call.pathname)).toContain("/api/events/tracked");
  expect(api.calls.map((call) => call.pathname)).not.toContain("/api/tasks");
});

test("avisa quando a lista falha e recarrega ao tentar de novo", async () => {
  const api = serve(events);
  api.failNext("GET", "/api/events/tracked", 503);
  render(<TasksScreen userId="user-1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as tarefas.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
  expect(await screen.findByRole("link", { name: /Pagar conta de luz/ })).toBeInTheDocument();
});

test("convida a criar o primeiro evento quando não há nenhum evento com status, e leva ao formulário de evento", async () => {
  serve([]);
  render(<TasksScreen userId="user-1" />);

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
  render(<TasksScreen userId="user-1" />);

  const links = await screen.findAllByRole("link", { name: /Pagar fatura/ });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "/user-1/eventos/dia-14");
  expect(within(screen.getByRole("region", { name: /A fazer/ })).getByText("Todo dia, 18:00")).toBeInTheDocument();
});

test("um evento com subtarefas mostra quantas já foram feitas; sem subtarefas não mostra fração", async () => {
  serve([
    eventFixture({ id: "proposta", name: "Revisar proposta", status: "doing" }),
    eventFixture({ id: "ler", name: "Ler a proposta", status: "done", parentEventIds: ["proposta"] }),
    eventFixture({ id: "rascunho", name: "Escrever rascunho", status: "todo", parentEventIds: ["proposta"] }),
    eventFixture({ id: "enviar", name: "Enviar proposta", status: "todo", parentEventIds: ["proposta"] }),
    eventFixture({ id: "luz", name: "Pagar conta de luz", status: "todo" }),
  ]);
  render(<TasksScreen userId="user-1" />);

  const proposta = (await screen.findByRole("link", { name: /Revisar proposta/ })).closest("li") as HTMLElement;
  expect(within(proposta).getByText("1/3")).toBeInTheDocument();
  expect(within(proposta).getByText("1 de 3 partes feitas")).toBeInTheDocument();

  const luz = screen.getByRole("link", { name: /Pagar conta de luz/ }).closest("li") as HTMLElement;
  expect(within(luz).queryByText(/\d\/\d/)).not.toBeInTheDocument();
});

test("um evento em espera com bloqueios diz por quantos eventos espera", async () => {
  serve([
    eventFixture({ id: "pneu", name: "Trocar o pneu", status: "inHold", blockedByEventIds: ["orcamento", "agenda"] }),
  ]);
  render(<TasksScreen userId="user-1" />);

  const pneu = (await screen.findByRole("link", { name: /Trocar o pneu/ })).closest("li") as HTMLElement;
  expect(within(pneu).getByText("Espera por 2 eventos")).toBeInTheDocument();
});
