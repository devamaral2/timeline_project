import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";
import { requestFixture, requestsArea } from "@/test/fake-api/requests";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { default: TaskPage } = await import("./page");

const NAME = "Treino de força";

/** Um treino de hoje, em curso, com lembretes, tags e descrição. */
function training(overrides: Partial<TaskDto> = {}): TaskDto {
  return eventFixture({
    id: "ev-1",
    name: NAME,
    kind: "training",
    status: "doing",
    priority: "medium",
    startedAt: "2026-11-14T18:30:00-03:00",
    estimatedFinishAt: "2026-11-14T19:20:00-03:00",
    notifyOffsetsMinutes: [30, 1440],
    tags: ["saúde", "pessoal"],
    description: "Foco em peito e tríceps.",
    ...overrides,
  });
}

let api: FakeApi;

function install(tasks: TaskDto[]) {
  api = createFakeApi({ areas: [eventsArea], seed: { events: tasks } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  return render(<TaskPage params={Promise.resolve({ userId: "user-1", eventId: "ev-1" })} />);
}

function patches() {
  return api.calls.filter((call) => call.method === "PATCH");
}

test("o topo mostra o código do tipo, o título, o status e a prioridade", async () => {
  install([training()]);
  renderPage();

  expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
  expect(screen.getByText("training")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Status: Em curso. Trocar status de ${NAME}` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Prioridade: Média. Trocar prioridade de ${NAME}` })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar para a Agenda" })).toHaveAttribute("href", "/user-1");
  expect(screen.queryByRole("link", { name: "Editar evento" })).not.toBeInTheDocument();
});

test("evento Só agenda (sem status) não mostra status nem prioridade no topo", async () => {
  install([training({ status: undefined })]);
  renderPage();

  expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Trocar status/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Trocar prioridade/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Só agenda")).not.toBeInTheDocument();
});

test("a seção Informações mostra início, término com a duração, tags, lembretes e descrição em texto", async () => {
  install([training()]);
  renderPage();

  const info = await screen.findByRole("region", { name: "Informações" });
  expect(within(info).getByText("Sáb, 14 nov · 18:30")).toBeInTheDocument();
  expect(within(info).getByText("Término")).toBeInTheDocument();
  expect(within(info).getByText("Sáb, 14 nov · 19:20")).toBeInTheDocument();
  expect(within(info).getByText("50 min")).toBeInTheDocument();
  expect(within(info).queryByText("Tarefa persistente")).not.toBeInTheDocument();
  expect(within(info).queryByText("Não")).not.toBeInTheDocument();
  expect(within(info).getByRole("list", { name: "Lembretes" })).toHaveTextContent(/30 min1 dia/);
  expect(within(info).getByText("#saúde")).toBeInTheDocument();
  expect(within(info).getByText("Foco em peito e tríceps.")).toBeInTheDocument();
  expect(screen.queryByText("Localização")).not.toBeInTheDocument();
  expect(screen.queryByText("Gerado por")).not.toBeInTheDocument();
});

test("a tarefa persistente aparece com um ponto no lugar do “Sim”", async () => {
  install([training({ longRunning: true })]);
  renderPage();

  const info = await screen.findByRole("region", { name: "Informações" });
  expect(within(info).getByText("Tarefa persistente")).toBeInTheDocument();
  expect(within(info).getByRole("img", { name: "Sim" })).toBeInTheDocument();
  expect(within(info).queryByText("Não")).not.toBeInTheDocument();
});

test("o evento longo mostra a previsão de entrega, sem término nem início", async () => {
  install([training({ longRunning: true, startedAt: undefined, estimatedFinishAt: "2026-11-20T00:00:00-03:00", notifyOffsetsMinutes: [] })]);
  renderPage();

  const info = await screen.findByRole("region", { name: "Informações" });
  expect(within(info).getByText("Previsão de entrega")).toBeInTheDocument();
  expect(within(info).getByText("Sex, 20 nov")).toBeInTheDocument();
  expect(within(info).queryByText("Término")).not.toBeInTheDocument();
  expect(within(info).queryByText("Início")).not.toBeInTheDocument();
  expect(within(info).getByRole("img", { name: "Sim" })).toBeInTheDocument();
});

test("a ocorrência de uma série mostra a regra e que ela segue a série", async () => {
  install([
    training({
      recurrence: {
        id: "rec-1",
        occurrenceOn: "2026-11-14",
        detached: false,
        rule: { frequency: "weekly", interval: 1, byWeekday: 42, timeOfDay: "18:30", timeZone: "America/Sao_Paulo", startsOn: "2026-11-03" },
      },
    }),
  ]);
  renderPage();

  const info = await screen.findByRole("region", { name: "Informações" });
  expect(within(info).getByText("Seg, qua e sex, 18:30")).toBeInTheDocument();
  expect(within(info).getByText("desde 3 nov · sem fim · esta ocorrência segue a série")).toBeInTheDocument();
});

test("concluir envia o status com finishedAt do instante atual e mostra o status novo", async () => {
  install([training()]);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: `Status: Em curso. Trocar status de ${NAME}` }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Status do evento" })).getByRole("option", { name: "Feito" }));

  await waitFor(() => expect(patches()).toHaveLength(1));
  // O relógio falso anda sozinho (`shouldAdvanceTime`): o instante exato não importa, só o dia e a hora.
  expect(patches()[0]?.body).toEqual({ expectedRevision: 1, status: "done", finishedAt: expect.stringMatching(/^2026-11-14T13:00:/) });
  expect(await screen.findByRole("button", { name: `Status: Feito. Trocar status de ${NAME}` })).toBeInTheDocument();
});

test("reabrir um evento feito manda finishedAt nulo", async () => {
  install([training({ status: "done", finishedAt: "2026-11-14T12:00:00.000Z" })]);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: `Status: Feito. Trocar status de ${NAME}` }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Status do evento" })).getByRole("option", { name: "Em espera" }));

  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]?.body).toEqual({ expectedRevision: 1, status: "inHold", finishedAt: null });
  expect(await screen.findByRole("button", { name: `Status: Em espera. Trocar status de ${NAME}` })).toBeInTheDocument();
});

test("trocar a prioridade manda a revisão lida e mostra a prioridade nova", async () => {
  install([training()]);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: `Prioridade: Média. Trocar prioridade de ${NAME}` }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Prioridade do evento" })).getByRole("option", { name: "Urgente" }));

  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]?.body).toEqual({ expectedRevision: 1, priority: "urgent" });
  expect(await screen.findByRole("button", { name: `Prioridade: Urgente. Trocar prioridade de ${NAME}` })).toBeInTheDocument();
});

test("a falha na troca devolve o status e avisa", async () => {
  install([training()]);
  api.failNext("PATCH", "/api/tasks/ev-1", 500);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: `Status: Em curso. Trocar status de ${NAME}` }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Status do evento" })).getByRole("option", { name: "Feito" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível trocar o status. Tente novamente.");
  expect(screen.getByRole("button", { name: `Status: Em curso. Trocar status de ${NAME}` })).toBeInTheDocument();
});

test("revisão velha: relê o evento e avisa, sem gravar a troca", async () => {
  install([training()]);
  renderPage();
  await screen.findByRole("heading", { level: 1, name: NAME });
  // Outra aba muda o evento antes desta troca: a revisão lida (1) já não vale.
  api.store.table<TaskDto>("events").set("ev-1", { ...training(), name: NAME, revision: 2, priority: "high" });
  fireEvent.click(screen.getByRole("button", { name: `Prioridade: Média. Trocar prioridade de ${NAME}` }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Prioridade do evento" })).getByRole("option", { name: "Baixa" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Este evento mudou em outro lugar.");
  expect(await screen.findByRole("button", { name: `Prioridade: Alta. Trocar prioridade de ${NAME}` })).toBeInTheDocument();
});

test("evento de agente: só o status aparece, sem prioridade nem seletor", async () => {
  // O evento de agente abre na forma do agente (ticket 45), que lê o pedido de mesmo id.
  api = createFakeApi({
    areas: [eventsArea, requestsArea()],
    seed: {
      events: [eventFixture({ id: "ev-1", actor: "agent", kind: "request", status: "running", priority: "medium", name: "Pesquisar voos" })],
      requests: [requestFixture({ id: "ev-1", title: "Pesquisar voos", status: "running" })],
    },
  });
  net.authedFetch.mockImplementation(api.authedFetch);
  renderPage();

  expect(await screen.findByRole("heading", { level: 1, name: "Pesquisar voos" })).toBeInTheDocument();
  expect(screen.getByText("Agente, executando")).toBeInTheDocument();
  expect(screen.queryByText("Média")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Trocar/ })).not.toBeInTheDocument();
});

test("evento inexistente mostra a tela de não encontrado", async () => {
  install([]);
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Evento não encontrado.");
});

test("o menu Mais ações leva à rota de edição", async () => {
  install([training()]);
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Mais ações" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));

  expect(push).toHaveBeenCalledWith("/user-1/eventos/ev-1/editar");
});
