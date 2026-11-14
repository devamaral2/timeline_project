import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDto, RequestDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";
import { advanceRequest, requestFixture, requestsArea } from "@/test/fake-api/requests";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { default: EventPage } = await import("./page");

/** O pedido e o evento de agente têm o mesmo id. 26 caracteres de Crockford, como o ULID da API. */
const ID = "01HZX4R5Q7M8N9P0T1V2W3Y4Z5";

const STEPS: RequestDto["steps"] = [
  { id: "s1", agent: "planner", label: "Entender o pedido", status: "done" },
  { id: "s2", agent: "searcher", label: "Buscar voos", status: "done" },
  { id: "s3", agent: "comparer", label: "Comparar preços", status: "running" },
  { id: "s4", agent: "writer", label: "Montar o resumo", status: "queued" },
];

function agentEvent(overrides: Partial<EventDto> = {}): EventDto {
  return eventFixture({
    id: ID,
    actor: "agent",
    kind: "request",
    status: "running",
    priority: "medium",
    name: "Pesquisar voos para novembro",
    startedAt: "2026-11-14T09:41:00-03:00",
    ...overrides,
  });
}

function agentRequest(overrides: Partial<RequestDto> = {}): RequestDto {
  return requestFixture({
    id: ID,
    title: "Pesquisar voos para novembro",
    text: "Pesquisar voos para novembro",
    status: "running",
    createdAt: "2026-11-14T09:41:00-03:00",
    updatedAt: "2026-11-14T09:53:00-03:00",
    steps: STEPS,
    ...overrides,
  });
}

let api: FakeApi;

function install(events: EventDto[], requests: RequestDto[]) {
  api = createFakeApi({ areas: [eventsArea, requestsArea()], seed: { events, requests } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T09:53:00-03:00"));
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  return render(<EventPage params={Promise.resolve({ userId: "user-1", eventId: ID })} />);
}

/** Espera o evento e o pedido saírem do estado de carregamento. */
async function loaded() {
  await waitFor(() => expect(screen.queryByText(/Carregando/)).not.toBeInTheDocument());
}

/** Quantas vezes a tela leu o pedido. */
function requestReads() {
  return api.calls.filter((call) => call.method === "GET" && call.pathname === `/api/requests/${ID}`).length;
}

test("um evento de agente abre na forma do agente: tipo, título, status e passos feitos, sem editar", async () => {
  install([agentEvent()], [agentRequest()]);
  renderPage();
  await loaded();

  const top = screen.getByRole("region", { name: "Resumo do evento" });
  expect(within(top).getByRole("heading", { level: 1, name: "Pesquisar voos para novembro" })).toBeInTheDocument();
  expect(within(top).getByText("request")).toBeInTheDocument();
  expect(within(top).getByText("Agente, executando")).toBeInTheDocument();
  expect(within(top).getByText("2 de 4 passos")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Editar evento" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Trocar status/ })).not.toBeInTheDocument();
});

test("Informações mostra o início com o tempo decorrido e 'ainda não concluído'; sem fim estimado nem job", async () => {
  install([agentEvent()], [agentRequest()]);
  renderPage();
  await loaded();

  const info = await screen.findByRole("region", { name: "Informações" });
  expect(within(info).getByText(/09:41/)).toBeInTheDocument();
  expect(within(info).getByText("há 12 min")).toBeInTheDocument();
  expect(within(info).getByText("Concluído")).toBeInTheDocument();
  expect(within(info).getByText("ainda não concluído")).toBeInTheDocument();
  expect(screen.queryByText("Fim estimado")).not.toBeInTheDocument();
  expect(screen.queryByText("Job")).not.toBeInTheDocument();
});

test("Passos lista cada passo com o agente interno e o status, e nenhum é um link", async () => {
  install([agentEvent()], [agentRequest()]);
  renderPage();
  await loaded();

  const steps = await screen.findByRole("region", { name: "Passos" });
  expect(within(steps).getByText("2/4")).toBeInTheDocument();
  for (const step of STEPS) {
    expect(within(steps).getByText(step.label)).toBeInTheDocument();
    expect(within(steps).getByText(step.agent)).toBeInTheDocument();
  }
  expect(within(steps).getByText("Agente, na fila")).toBeInTheDocument();
  expect(within(steps).queryByRole("link")).not.toBeInTheDocument();
  expect(within(steps).queryByRole("button")).not.toBeInTheDocument();
});

test("Registro mostra a criação e a última alteração do pedido", async () => {
  install([agentEvent()], [agentRequest()]);
  renderPage();
  await loaded();

  const record = await screen.findByRole("region", { name: "Registro" });
  expect(within(record).getByText("Criado em")).toBeInTheDocument();
  expect(within(record).getByText(/09:41/)).toBeInTheDocument();
  expect(within(record).getByText("Última alteração")).toBeInTheDocument();
  expect(within(record).getByText(/09:53/)).toBeInTheDocument();
});

test("com o pedido em aberto, a tela relê o pedido e o evento até o estado final", async () => {
  install([agentEvent()], [agentRequest()]);
  renderPage();
  await loaded();
  await screen.findByRole("region", { name: "Passos" });

  advanceRequest(api, ID, { status: "done", steps: STEPS.map((step) => ({ ...step, status: "done" })) });
  api.store.table<EventDto>("events").set(ID, agentEvent({ status: "done", finishedAt: "2026-11-14T09:58:00-03:00" }));

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });

  const top = screen.getByRole("region", { name: "Resumo do evento" });
  expect(await within(top).findByText("Agente, feito")).toBeInTheDocument();
  expect(within(top).getByText("4 de 4 passos")).toBeInTheDocument();
  const info = screen.getByRole("region", { name: "Informações" });
  expect(within(info).getByText(/09:58/)).toBeInTheDocument();
  expect(within(info).queryByText("ainda não concluído")).not.toBeInTheDocument();
});

test("um pedido no estado final não é relido", async () => {
  install([agentEvent({ status: "done", finishedAt: "2026-11-14T09:58:00-03:00" })], [agentRequest({ status: "done" })]);
  renderPage();
  await loaded();
  await screen.findByRole("region", { name: "Passos" });
  expect(requestReads()).toBe(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });

  expect(requestReads()).toBe(1);
});

test("um evento de agente sem pedido diz que o pedido não foi encontrado", async () => {
  install([agentEvent()], []);
  renderPage();

  expect(await screen.findByRole("alert")).toHaveTextContent("Pedido não encontrado.");
});
