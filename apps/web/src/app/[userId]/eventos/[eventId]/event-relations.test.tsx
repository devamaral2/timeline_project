import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { default: EventPage } = await import("./page");

const PARENT = "Preparar a viagem";

/** O evento aberto: um projeto em curso, com três subtarefas e bloqueios nos dois sentidos. */
function parent(overrides: Partial<EventDto> = {}): EventDto {
  return eventFixture({
    id: "ev-1",
    name: PARENT,
    kind: "routine",
    status: "doing",
    startedAt: "2026-11-14T09:00:00-03:00",
    subtaskEventIds: ["sub-1", "sub-2", "sub-3"],
    blockedByEventIds: ["blk-1"],
    blocksEventIds: ["bl-2"],
    ...overrides,
  });
}

const SUBTASKS = [
  eventFixture({ id: "sub-1", name: "Reservar o voo", status: "done", finishedAt: "2026-11-13T12:00:00.000Z", startedAt: "2026-11-14T10:00:00-03:00" }),
  eventFixture({ id: "sub-2", name: "Montar a lista", status: "todo", startedAt: "2026-11-14T11:00:00-03:00" }),
  eventFixture({ id: "sub-3", name: "Pagar o seguro", status: "doing", startedAt: "2026-11-14T12:00:00-03:00" }),
];

const OTHERS = [
  eventFixture({ id: "blk-1", name: "Renovar o passaporte", kind: "meal", status: "todo", startedAt: "2026-11-14T20:00:00-03:00" }),
  eventFixture({ id: "bl-2", name: "Arrumar a mala", kind: "routine", status: "todo", startedAt: "2026-11-15T07:00:00-03:00" }),
];

let api: FakeApi;

function install(events: EventDto[]) {
  api = createFakeApi({ areas: [eventsArea], seed: { events } });
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
  return render(<EventPage params={Promise.resolve({ userId: "user-1", eventId: "ev-1" })} />);
}

/** Espera as duas seções sairem do estado de carregamento. */
async function loaded() {
  await waitFor(() => expect(screen.queryByText(/Carregando/)).not.toBeInTheDocument());
}

function patches() {
  return api.calls.filter((call) => call.method === "PATCH");
}

test("a seção Subtarefas lista as subtarefas com a fração feita", async () => {
  install([parent(), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Subtarefas" });
  expect(within(section).getByText("1/3")).toBeInTheDocument();
  expect(within(section).getByRole("link", { name: /Reservar o voo/ })).toBeInTheDocument();
  expect(within(section).getByRole("link", { name: /Montar a lista/ })).toBeInTheDocument();
  expect(within(section).getByRole("link", { name: /Pagar o seguro/ })).toBeInTheDocument();
});

test("trocar o status de uma subtarefa manda a revisão dela e concluir envia finishedAt", async () => {
  install([parent(), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Subtarefas" });
  fireEvent.click(within(section).getByRole("button", { name: "A fazer. Mudar status de “Montar a lista”" }));

  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]?.pathname).toBe("/api/events/sub-2");
  // O relógio falso anda sozinho: o instante exato não importa, só o dia.
  expect(patches()[0]?.body).toEqual({ expectedRevision: 1, status: "done", finishedAt: expect.stringMatching(/^2026-11-14T13:00:/) });
  expect(await within(section).findByRole("button", { name: "Feito. Mudar status de “Montar a lista”" })).toBeInTheDocument();
  expect(within(section).getByText("2/3")).toBeInTheDocument();
});

test("reabrir uma subtarefa feita leva a “a fazer” e manda finishedAt nulo", async () => {
  install([parent(), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Subtarefas" });
  fireEvent.click(within(section).getByRole("button", { name: "Feito. Mudar status de “Reservar o voo”" }));

  await waitFor(() => expect(patches()).toHaveLength(1));
  expect(patches()[0]?.pathname).toBe("/api/events/sub-1");
  expect(patches()[0]?.body).toEqual({ expectedRevision: 1, status: "todo", finishedAt: null });
  expect(await within(section).findByRole("button", { name: "A fazer. Mudar status de “Reservar o voo”" })).toBeInTheDocument();
});

test("tocar numa subtarefa abre o detalhe dela", async () => {
  install([parent(), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Subtarefas" });
  expect(within(section).getByRole("link", { name: /Montar a lista/ })).toHaveAttribute("href", "/user-1/eventos/sub-2");
});

test("a seção Bloqueios mostra bloqueado por e bloqueia, cada evento com nome, tipo e quando", async () => {
  install([parent(), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Bloqueios" });
  const blockedBy = within(section).getByRole("list", { name: "Bloqueado por" });
  expect(within(blockedBy).getByRole("link", { name: /Renovar o passaporte/ })).toHaveAttribute("href", "/user-1/eventos/blk-1");
  expect(within(blockedBy).getByText("meal")).toBeInTheDocument();
  expect(within(blockedBy).getByText("Hoje, 20:00")).toBeInTheDocument();

  const blocks = within(section).getByRole("list", { name: "Bloqueia" });
  expect(within(blocks).getByRole("link", { name: /Arrumar a mala/ })).toHaveAttribute("href", "/user-1/eventos/bl-2");
  expect(within(blocks).getByText("routine")).toBeInTheDocument();
  expect(within(blocks).getByText("Amanhã, 07:00")).toBeInTheDocument();
});

test("sem bloqueio num sentido, a seção diz nenhum evento", async () => {
  install([parent({ blockedByEventIds: [], blocksEventIds: ["bl-2"] }), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Bloqueios" });
  const blockedBy = within(section).getByRole("group", { name: "Bloqueado por" });
  expect(within(blockedBy).getByText("nenhum evento")).toBeInTheDocument();
  expect(within(section).queryByRole("list", { name: "Bloqueado por" })).not.toBeInTheDocument();
  expect(within(section).getByRole("list", { name: "Bloqueia" })).toBeInTheDocument();
});

test("sem bloqueio nenhum, as duas direções dizem nenhum evento", async () => {
  install([parent({ blockedByEventIds: [], blocksEventIds: [] }), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Bloqueios" });
  expect(within(section).getAllByText("nenhum evento")).toHaveLength(2);
});

test("tocar num evento de bloqueio abre o detalhe dele", async () => {
  install([parent(), ...SUBTASKS, ...OTHERS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Bloqueios" });
  fireEvent.click(within(section).getByRole("link", { name: /Renovar o passaporte/ }));
  expect(within(section).getByRole("link", { name: /Renovar o passaporte/ })).toHaveAttribute("href", "/user-1/eventos/blk-1");
});
