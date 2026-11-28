import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { type StoredArtifact, artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { PullToRefresh } from "@/components/shell/pull-to-refresh";
import { pullDown } from "@/test/pull-down";

// A tela troca o authedFetch pela API falsa: a rede inteira passa por ela.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { NotesScreen } = await import("./NotesScreen");
const { SectionMenu } = await import("@/components/shell/section-menu");

/** A lista com o menu da barra inferior aberto: a busca mora nele. */
function renderWithMenu() {
  render(
    <>
      <NotesScreen userId="user-1" />
      <SectionMenu id="menu-artefatos" section="notes" title="Artefatos" open onClose={() => {}} />
    </>,
  );
}
const searchbox = () => within(screen.getByRole("region", { name: "Opções de artefatos" })).getByRole("searchbox", { name: "Buscar nos artefatos" });

type Seed = Parameters<typeof createFakeApi>[0]["seed"];

let api: FakeApi;

function install(seed: Seed = {}) {
  api = createFakeApi({ areas: [artifactsArea], seed });
  net.authedFetch.mockImplementation(api.authedFetch);
}

const FOOD = {
  description: "Arroz e feijão",
  items: [],
  totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
  generation: { status: "completed" },
};
const SLEEP = { trackedSleepTime: 420, score: 80 };

function lastQuery(): Record<string, string> {
  return api.calls.at(-1)?.query ?? {};
}

/** Os ids dos artefatos listados, na ordem da tela (cada item é um link para a nota). */
function listedIds(): string[] {
  return within(screen.getByRole("region", { name: "Lista de artefatos" }))
    .queryAllByRole("link")
    .map((link) => link.getAttribute("href")?.split("/").pop() ?? "");
}

/** A base de testes: três artefatos do usuário e uma cópia derivada que não pode aparecer. */
function seeded(): Seed {
  return {
    artifacts: [
      artifactFixture({
        id: "art-antiga",
        name: "Livros para ler",
        data: { body: "Torto arado." },
        tags: ["leitura"],
        updatedAt: "2026-09-10T10:00:00.000Z",
      }),
      artifactFixture({
        id: "art-nova",
        name: "Almoço",
        type: "food",
        data: FOOD,
        tags: ["casa"],
        updatedAt: "2026-09-12T10:00:00.000Z",
      }),
      artifactFixture({
        id: "art-texto",
        name: "Lista de compras",
        data: { body: "Comprar leite" },
        tags: ["casa"],
        updatedAt: "2026-09-11T10:00:00.000Z",
      }),
      artifactFixture({
        id: "art-copia",
        name: "Arroz (cópia)",
        type: "food",
        data: FOOD,
        derived: true,
        updatedAt: "2026-09-13T10:00:00.000Z",
      }),
      artifactFixture({
        id: "art-sono",
        name: "Noite",
        type: "sleep",
        data: SLEEP,
        tags: ["casa"],
        updatedAt: "2026-09-09T10:00:00.000Z",
      }),
    ],
  };
}

beforeEach(() => {
  net.authedFetch.mockReset();
  install(seeded());
});

describe("lista", () => {
  test("lista os artefatos do usuário do mais recente para o mais antigo, sem as cópias derivadas", async () => {
    render(<NotesScreen userId="user-1" />);

    await screen.findByRole("heading", { level: 1, name: "4 artefatos" });
    expect(listedIds()).toEqual(["art-nova", "art-texto", "art-antiga", "art-sono"]);
    expect(screen.queryByText("Arroz (cópia)")).not.toBeInTheDocument();
    expect(api.calls[0]).toMatchObject({ method: "GET", pathname: "/api/artifacts" });
  });

  test("cada item mostra o nome, o tipo e as tags, e leva à rota de nota", async () => {
    render(<NotesScreen userId="user-1" />);
    await screen.findByRole("heading", { level: 1, name: "4 artefatos" });

    const almoco = within(screen.getByRole("region", { name: "Lista de artefatos" })).getByRole("link", { name: /Almoço/ });
    expect(almoco).toHaveAttribute("href", "/user-1/notas/art-nova");
    expect(within(almoco).getByText("Refeição")).toBeInTheDocument();
    expect(within(almoco).getByText("#casa")).toBeInTheDocument();
  });
});

describe("busca", () => {
  test("o texto vai como q e busca no nome e no corpo", async () => {
    renderWithMenu();
    await screen.findByRole("heading", { level: 1, name: "4 artefatos" });

    fireEvent.change(searchbox(), { target: { value: "leite" } });

    await waitFor(() => expect(lastQuery()).toEqual({ q: "leite" }));
    expect(listedIds()).toEqual(["art-texto"]);
  });

  test("nenhum artefato combina com a busca: avisa, e Limpar filtros volta à lista inteira", async () => {
    renderWithMenu();
    await screen.findByRole("heading", { level: 1, name: "4 artefatos" });

    fireEvent.change(searchbox(), { target: { value: "zzz" } });

    expect(await screen.findByRole("heading", { name: "Nenhum artefato encontrado" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("region", { name: "Lista de artefatos" })).getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(lastQuery()).toEqual({}));
    expect(listedIds()).toEqual(["art-nova", "art-texto", "art-antiga", "art-sono"]);
    expect(searchbox()).toHaveValue("");
  });
});

describe("estados", () => {
  test("mostra o carregamento enquanto a lista não chega", () => {
    net.authedFetch.mockReturnValue(new Promise(() => {}));
    render(<NotesScreen userId="user-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Carregando artefatos…");
  });

  test("oferece tentar de novo quando a leitura falha", async () => {
    api.failNext("GET", "/api/artifacts", 500);
    render(<NotesScreen userId="user-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os artefatos.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(await screen.findByRole("heading", { level: 1, name: "4 artefatos" })).toBeInTheDocument();
  });

  test("convida a criar a primeira nota quando o usuário não tem nenhuma", async () => {
    install({});
    render(<NotesScreen userId="user-1" />);

    expect(await screen.findByRole("heading", { name: "Nenhum artefato ainda" })).toBeInTheDocument();
  });

  test("uma cópia derivada sozinha não conta como nota: a lista continua vazia", async () => {
    install({ artifacts: [artifactFixture({ id: "art-copia", name: "Cópia", type: "food", data: FOOD, derived: true })] });
    render(<NotesScreen userId="user-1" />);

    expect(await screen.findByRole("heading", { name: "Nenhum artefato ainda" })).toBeInTheDocument();
  });
});

describe("notícias, resumo de e-mail e transcrição", () => {
  function seededWithFreeText(): Seed {
    return {
      artifacts: [
        artifactFixture({ id: "art-nota", name: "Lista de compras", data: { body: "Comprar leite" }, updatedAt: "2026-09-10T10:00:00.000Z" }),
        artifactFixture({ id: "art-noticias", name: "Notícias da manhã", type: "news", data: { body: "# Manchetes\n\n- Chuva no fim de semana" }, tags: ["leitura"], updatedAt: "2026-09-13T10:00:00.000Z" }),
        artifactFixture({ id: "art-email", name: "Resumo da caixa de entrada", type: "email_summary", data: { body: "A fatura vence amanhã." }, updatedAt: "2026-09-12T10:00:00.000Z" }),
        artifactFixture({ id: "art-video", name: "Aula de jardinagem", type: "youtube_transcript", data: { body: "00:00 Como podar roseiras" }, updatedAt: "2026-09-11T10:00:00.000Z" }),
        artifactFixture({ id: "art-sono", name: "Noite", type: "sleep", data: SLEEP, updatedAt: "2026-09-09T10:00:00.000Z" }),
      ],
    };
  }

  function row(name: RegExp): HTMLElement {
    return within(screen.getByRole("region", { name: "Lista de artefatos" })).getByRole("link", { name });
  }

  test("cada um aparece com o rótulo e o ícone do tipo, e leva ao detalhe", async () => {
    install(seededWithFreeText());
    render(<NotesScreen userId="user-1" />);
    await screen.findByRole("heading", { level: 1, name: "5 artefatos" });

    expect(listedIds()).toEqual(["art-noticias", "art-email", "art-video", "art-nota", "art-sono"]);
    for (const [name, label, glyph, id] of [
      [/Notícias da manhã/, "Notícias", "lucide-newspaper", "art-noticias"],
      [/Resumo da caixa de entrada/, "Resumo de e-mail", "lucide-letter", "art-email"],
      [/Aula de jardinagem/, "Transcrição", "lucide-youtube", "art-video"],
    ] as const) {
      const link = row(name);
      expect(link).toHaveAttribute("href", `/user-1/notas/${id}`);
      expect(within(link).getByText(label)).toBeInTheDocument();
      expect(link.querySelector(`.${glyph}`), label).not.toBeNull();
    }
    // A nota continua com a letra, não com um desses desenhos.
    expect(row(/Lista de compras/).querySelector('[data-glyph="letter"]')).not.toBeNull();
  });

  test("a busca encontra o texto dentro deles", async () => {
    install(seededWithFreeText());
    renderWithMenu();
    await screen.findByRole("heading", { level: 1, name: "5 artefatos" });

    fireEvent.change(searchbox(), { target: { value: "roseiras" } });

    await waitFor(() => expect(lastQuery()).toEqual({ q: "roseiras" }));
    await waitFor(() => expect(listedIds()).toEqual(["art-video"]));
  });
});

describe("puxar para recarregar", () => {
  test("relê a lista com os filtros atuais, sem voltar ao esqueleto", async () => {
    render(<><PullToRefresh /><NotesScreen userId="user-1" /><SectionMenu id="menu-artefatos" section="notes" title="Artefatos" open onClose={() => {}} /></>);
    await screen.findByRole("heading", { level: 1, name: "4 artefatos" });
    fireEvent.change(searchbox(), { target: { value: "torto" } });
    await waitFor(() => expect(listedIds()).toEqual(["art-antiga"]));
    const reads = api.calls.length;

    const stored = api.store.table<StoredArtifact>("artifacts").get("art-antiga");
    if (stored) stored.name = "Livros lidos";
    pullDown();

    expect(await screen.findByRole("link", { name: /Livros lidos/ })).toBeInTheDocument();
    expect(api.calls).toHaveLength(reads + 1);
    expect(lastQuery()).toMatchObject({ q: "torto" });
    expect(screen.queryByText("Carregando artefatos…")).not.toBeInTheDocument();
  });

  test("o puxão que falha mantém a lista na tela e avisa", async () => {
    render(<><PullToRefresh /><NotesScreen userId="user-1" /></>);
    await screen.findByRole("heading", { level: 1, name: "4 artefatos" });

    api.failNext("GET", "/api/artifacts", 500);
    pullDown();

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível atualizar os artefatos. Tente novamente.");
    expect(listedIds()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  test("na tela de erro, o puxão que dá certo traz a lista", async () => {
    api.failNext("GET", "/api/artifacts", 500);
    render(<><PullToRefresh /><NotesScreen userId="user-1" /></>);
    await screen.findByRole("button", { name: "Tentar de novo" });

    pullDown();

    expect(await screen.findByRole("heading", { level: 1, name: "4 artefatos" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
