import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto, RequestDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { eventFixture, eventsArea } from "@/test/fake-api/events";
import { requestFixture, requestsArea } from "@/test/fake-api/requests";

const back = vi.fn();
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back, replace }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { default: EventPage } = await import("./page");

let api: FakeApi;

function install(events: TaskDto[], requests: RequestDto[] = []) {
  api = createFakeApi({ areas: [eventsArea, requestsArea()], seed: { events, requests } });
  const owners = api.store.table<string>("requestOwners");
  for (const request of requests) owners.set(request.id, "user-1");
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  back.mockReset();
  push.mockReset();
  replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  return render(<EventPage params={Promise.resolve({ userId: "user-1", eventId: "ev-1" })} />);
}

async function loaded() {
  await waitFor(() => expect(screen.queryByText(/Carregando/)).not.toBeInTheDocument());
}

function deletes() {
  return api.calls.filter((call) => call.method === "DELETE");
}

/** Abre "Mais ações" e escolhe "Excluir": devolve o diálogo de confirmação. */
async function openDeleteDialog() {
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));
  return screen.findByRole("alertdialog", { name: "Excluir evento" });
}

test("Mais ações oferece Excluir, e Cancelar fecha sem apagar", async () => {
  install([eventFixture({ id: "ev-1", name: "Reunião de pauta" })]);
  renderPage();

  const dialog = await openDeleteDialog();
  expect(within(dialog).getByText(/Reunião de pauta/)).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(deletes()).toHaveLength(0);
  expect(back).not.toHaveBeenCalled();
});

test("confirmar apaga o evento pela API e volta para a tela de onde o usuário veio", async () => {
  install([eventFixture({ id: "ev-1", name: "Reunião de pauta" })]);
  renderPage();

  const dialog = await openDeleteDialog();
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

  await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
  expect(deletes()).toEqual([expect.objectContaining({ pathname: "/api/events/ev-1" })]);
  expect(api.store.table("events").has("ev-1")).toBe(false);
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

test("se o evento já não existe, a tela avisa e volta do mesmo jeito", async () => {
  install([eventFixture({ id: "ev-1", name: "Reunião de pauta" })]);
  renderPage();

  const dialog = await openDeleteDialog();
  // Apagado em outro lugar depois de abrir o diálogo.
  api.store.table("events").delete("ev-1");
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Este evento já não existe");
  expect(back).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
  expect(back).toHaveBeenCalledTimes(1);
});

test("falha ao apagar mantém o evento aberto e avisa, sem voltar", async () => {
  install([eventFixture({ id: "ev-1", name: "Reunião de pauta" })]);
  renderPage();

  const dialog = await openDeleteDialog();
  api.failNext("DELETE", "/api/events/ev-1", 503);
  fireEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Não foi possível excluir o evento");
  expect(within(dialog).getByRole("button", { name: "Excluir" })).toBeEnabled();
  expect(back).not.toHaveBeenCalled();
  expect(api.store.table("events").has("ev-1")).toBe(true);
});

test("evento de agente não oferece Excluir", async () => {
  const request = requestFixture({ id: "ev-1", title: "Pesquisar voos", text: "Pesquisar voos", status: "running" });
  install([eventFixture({ id: "ev-1", actor: "agent", kind: "request", status: "running", name: "Pesquisar voos" })], [request]);
  renderPage();
  await loaded();

  expect(screen.queryByRole("button", { name: "Mais ações" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Excluir" })).not.toBeInTheDocument();
});
