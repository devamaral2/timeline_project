import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { agentFileFixture, agentFilesArea } from "@/test/fake-api/agent-files";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/user-1/notas/skill-1",
}));

// A tela troca o authedFetch pela API falsa: a rede inteira passa por ela.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { NoteDetailScreen } = await import("./NoteDetailScreen");

const SKILL = "hermes/skills/pesquisa/SKILL.md";
const TEXT = "---\ndescription: Pesquisa na web\n---\n# Pesquisa\n\nPasso 1: buscar fontes";
const DESCRIPTION = "Pesquisa na web";

let api: FakeApi;

function install({ owner, missing = false }: { owner: boolean; missing?: boolean }) {
  api = createFakeApi({
    areas: [artifactsArea, agentFilesArea({ owner })],
    seed: {
      agentFiles: [agentFileFixture({ path: SKILL, text: TEXT, missing })],
      artifacts: [
        artifactFixture({
          id: "skill-1",
          name: "Pesquisa",
          type: "skill",
          data: { path: SKILL, hash: "1f2e3d4c".padEnd(64, "0"), missing, description: DESCRIPTION },
        }),
      ],
    },
  });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
});

test("o dono vê o caminho, a versão, a descrição e o texto atual do arquivo", async () => {
  install({ owner: true });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  const card = await screen.findByRole("article", { name: "Arquivo do Hermes" });
  expect(within(card).getByText(SKILL)).toBeInTheDocument();
  expect(within(card).getByText("1f2e3d4c")).toBeInTheDocument();
  expect(within(card).getByText(DESCRIPTION, { selector: "p" })).toBeInTheDocument();
  expect((await within(card).findByLabelText("Texto do arquivo")).textContent).toContain("buscar fontes");
  expect(api.calls.at(-1)).toMatchObject({ method: "GET", pathname: "/api/ai/config/file", query: { path: SKILL } });
});

test("um arquivo que sumiu da pasta mostra o último texto conhecido e avisa que não está mais lá", async () => {
  install({ owner: true, missing: true });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  const card = await screen.findByRole("article", { name: "Arquivo do Hermes" });
  expect(within(card).getByText(/não está mais na pasta/)).toBeInTheDocument();
  expect((await within(card).findByLabelText("Texto do arquivo")).textContent).toContain("buscar fontes");
});

test("quem não é o dono vê o caminho e a descrição, sem texto e sem mensagem de erro", async () => {
  install({ owner: false });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  const card = await screen.findByRole("article", { name: "Arquivo do Hermes" });
  expect(within(card).getByText(SKILL)).toBeInTheDocument();
  expect(within(card).getByText(DESCRIPTION, { selector: "p" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Texto do arquivo")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Texto bruto" })).not.toBeInTheDocument();
});
