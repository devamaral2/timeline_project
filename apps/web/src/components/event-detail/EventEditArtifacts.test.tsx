import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { type StoredArtifact, artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { eventFixture, eventsArea } from "@/test/fake-api/events";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { EventEditRoute } = await import("./EventEditRoute");

const DETAIL_PATH = "/user-1/eventos/ev-1";

/** O evento aberto, com revisão 3, e três artefatos ligados: duas fichas (uses) e o que ele criou. */
const EVENT = eventFixture({
  id: "ev-1",
  name: "Treino de força",
  kind: "training",
  status: "doing",
  startedAt: "2026-11-14T18:30:00-03:00",
  estimatedFinishAt: "2026-11-14T19:20:00-03:00",
  revision: 3,
});

/** Os artefatos do usuário. "Caminhada" não está ligada e é a que a busca acha. */
const ARTIFACTS: StoredArtifact[] = [
  artifactFixture({ id: "art-sheet", name: "Ficha A", links: [{ eventId: "ev-1", relation: "uses" }] }),
  artifactFixture({ id: "art-sheet-b", name: "Ficha B", links: [{ eventId: "ev-1", relation: "uses" }] }),
  artifactFixture({ id: "art-created", name: "Registro do treino", links: [{ eventId: "ev-1", relation: "creates" }] }),
  artifactFixture({ id: "art-walk", name: "Caminhada no parque" }),
];

let api: FakeApi;

function install() {
  api = createFakeApi({ areas: [eventsArea, artifactsArea], seed: { events: [EVENT], artifacts: ARTIFACTS } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

function renderRoute() {
  return render(<EventEditRoute userId="user-1" eventId="ev-1" />);
}

function patches() {
  return api.calls.filter((call) => call.method === "PATCH");
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
}

async function loaded() {
  await screen.findByRole("heading", { level: 1, name: "Editar evento" });
}

function linked() {
  return screen.getByRole("list", { name: "Artefatos ligados" });
}

/** A ordem dos nomes na lista de artefatos ligados, lida pelo botão Remover de cada linha. */
function linkedNames(): string[] {
  return within(linked())
    .getAllByRole("button", { name: /^Remover artefato/ })
    .map((button) => (button.getAttribute("aria-label") ?? "").replace(/^Remover artefato “/, "").replace(/”$/, ""));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
  replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("artefatos na edição", () => {
  it("a lista mostra os artefatos do evento na ordem da API, com o que ele criou sem posição", async () => {
    install();
    renderRoute();
    await loaded();

    expect(within(linked()).getByText("Ficha A")).toBeInTheDocument();
    expect(within(linked()).getByText("Ficha B")).toBeInTheDocument();
    expect(within(linked()).getByText("sem posição na lista")).toBeInTheDocument();
  });

  it("buscar um artefato seu o põe no fim com a relação uses, e Salvar manda a lista inteira na ordem da tela", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar artefato para ligar" }), { target: { value: "Caminhada" } });
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Caminhada no parque”" }));
    expect(linkedNames()).toEqual(["Ficha A", "Ficha B", "Registro do treino", "Caminhada no parque"]);
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        pathname: "/api/events/ev-1",
        body: {
          expectedRevision: 3,
          artifacts: [
            { id: "art-sheet", relation: "uses" },
            { id: "art-sheet-b", relation: "uses" },
            { id: "art-created", relation: "creates" },
            { id: "art-walk", relation: "uses" },
          ],
        },
      }),
    ]);
  });

  it("a busca não oferece o que já está na lista", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar artefato para ligar" }), { target: { value: "Ficha" } });
    await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/artifacts" && call.query.q === "Ficha")).toBe(true));
    expect(screen.queryByRole("button", { name: "Escolher “Ficha A”" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher “Ficha B”" })).not.toBeInTheDocument();
  });

  it("subir e descer reordenam, e a ordem enviada é a da tela; o que o evento criou não se move", async () => {
    install();
    renderRoute();
    await loaded();

    expect(screen.getByRole("button", { name: "Subir “Ficha A”" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Descer “Ficha A”" }));
    expect(linkedNames()).toEqual(["Ficha B", "Ficha A", "Registro do treino"]);
    expect(screen.queryByRole("button", { name: "Subir “Registro do treino”" })).not.toBeInTheDocument();
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        body: {
          expectedRevision: 3,
          artifacts: [
            { id: "art-sheet-b", relation: "uses" },
            { id: "art-sheet", relation: "uses" },
            { id: "art-created", relation: "creates" },
          ],
        },
      }),
    ]);
    const event = (await api.authedFetch("/api/events/ev-1")) as EventDto;
    expect(event.artifacts.map((link) => link.artifact.name)).toEqual(["Ficha B", "Ficha A", "Registro do treino"]);
  });

  it("remover tira a ligação na hora, a remoção vai no Salvar, e o artefato continua existindo", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.click(screen.getByRole("button", { name: "Remover artefato “Ficha B”" }));
    expect(linkedNames()).toEqual(["Ficha A", "Registro do treino"]);
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        body: { expectedRevision: 3, artifacts: [{ id: "art-sheet", relation: "uses" }, { id: "art-created", relation: "creates" }] },
      }),
    ]);
    const removed = (await api.authedFetch("/api/artifacts/art-sheet-b")) as { name: string };
    expect(removed.name).toBe("Ficha B");
  });

  it("ligar, reordenar e remover antes de um Salvar só: o corpo leva a lista que está na tela", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar artefato para ligar" }), { target: { value: "Caminhada" } });
    fireEvent.click(await screen.findByRole("button", { name: "Escolher “Caminhada no parque”" }));
    fireEvent.click(screen.getByRole("button", { name: "Subir “Caminhada no parque”" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover artefato “Ficha A”" }));
    // Subir a caminhada troca com a Ficha B, que é a posição de cima; o que o evento criou fica no meio, sem número.
    expect(linkedNames()).toEqual(["Caminhada no parque", "Registro do treino", "Ficha B"]);
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([
      expect.objectContaining({
        body: {
          expectedRevision: 3,
          artifacts: [
            { id: "art-walk", relation: "uses" },
            { id: "art-created", relation: "creates" },
            { id: "art-sheet-b", relation: "uses" },
          ],
        },
      }),
    ]);
  });

  it("sem mexer na lista, o Salvar não manda artifacts", async () => {
    install();
    renderRoute();
    await loaded();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Treino de costas" } });
    save();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(DETAIL_PATH));
    expect(patches()).toEqual([expect.objectContaining({ body: { expectedRevision: 3, name: "Treino de costas" } })]);
  });
});
