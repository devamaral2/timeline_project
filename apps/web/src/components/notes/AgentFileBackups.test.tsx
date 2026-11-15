import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { artifactFixture, artifactsArea } from "@/test/fake-api/artifacts";
import { agentFileBackupFixture, agentFileFixture, agentFilesArea } from "@/test/fake-api/agent-files";

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
const CURRENT = "---\ndescription: Pesquisa na web\n---\n# Pesquisa\n\nPasso 1: buscar fontes";
const OLDER = "# Pesquisa\n\nPasso único";
// Dois KB exatos: a lista mostra o tamanho em KB, com uma casa decimal.
const BIG = "x".repeat(2048);

let api: FakeApi;

function install({ owner }: { owner: boolean }) {
  api = createFakeApi({
    areas: [artifactsArea, agentFilesArea({ owner })],
    seed: {
      agentFiles: [agentFileFixture({ path: SKILL, text: CURRENT })],
      agentFileBackups: [
        agentFileBackupFixture({ id: "2026-09-12T15-00-00-000Z-0001.bak", path: SKILL, text: OLDER, createdAt: "2026-09-12T15:00:00.000Z" }),
        agentFileBackupFixture({ id: "2026-09-13T15-00-00-000Z-0002.bak", path: SKILL, text: BIG, createdAt: "2026-09-13T15:00:00.000Z" }),
      ],
      artifacts: [
        artifactFixture({
          id: "skill-1",
          name: "Pesquisa",
          type: "skill",
          data: { path: SKILL, hash: "1f2e3d4c".padEnd(64, "0"), missing: false, description: "Pesquisa na web" },
        }),
      ],
    },
  });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
}

/** A seção de backups, pelo nome do grupo (só existe para o dono). */
async function backupsSection() {
  return screen.findByRole("region", { name: "Backups" });
}

/** O texto do arquivo na tela: espera a releitura depois de restaurar (o texto antigo fica até chegar o novo). */
async function expectText(card: HTMLElement, text: string) {
  await waitFor(() => expect(within(card).getByLabelText("Texto do arquivo")).toHaveTextContent(text));
}

/** Os botões "Restaurar" da lista, do mais novo para o mais antigo (esperam a lista chegar). */
async function restoreButtons() {
  return within(await backupsSection()).findAllByRole("button", { name: /Restaurar backup/ });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
});

test("lista os backups do mais novo para o mais antigo, com data e tamanho, sem mostrar o texto", async () => {
  install({ owner: true });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  const section = await backupsSection();
  const rows = await within(section).findAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("13 de set");
  expect(rows[0]).toHaveTextContent("2 KB");
  expect(rows[1]).toHaveTextContent("12 de set");
  expect(rows[1]).toHaveTextContent("24 B");
  // O texto de um backup não aparece antes de restaurar: a API não o devolve.
  expect(screen.queryByText("Passo único")).not.toBeInTheDocument();
  expect(api.calls.some((call) => call.pathname === "/api/ai/config/backups")).toBe(true);
});

test("restaurar pede confirmação e, depois dela, mostra o texto restaurado", async () => {
  install({ owner: true });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  fireEvent.click((await restoreButtons())[1]); // o mais antigo

  const dialog = await screen.findByRole("alertdialog", { name: "Restaurar backup" });
  expect(api.calls.some((call) => call.pathname === "/api/ai/config/restore")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Restaurar" }));

  const card = screen.getByRole("article", { name: "Arquivo do Hermes" });
  await expectText(card, "Passo único");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(api.calls.find((call) => call.pathname === "/api/ai/config/restore")).toMatchObject({
    method: "POST",
    body: { path: SKILL, backupId: "2026-09-12T15-00-00-000Z-0001.bak" },
  });
});

test("cancelar a confirmação não restaura nada", async () => {
  install({ owner: true });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  fireEvent.click((await restoreButtons())[1]);
  const dialog = await screen.findByRole("alertdialog", { name: "Restaurar backup" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(api.calls.some((call) => call.pathname === "/api/ai/config/restore")).toBe(false);
});

test("o texto substituído vira um backup novo, e restaurá-lo desfaz a restauração", async () => {
  install({ owner: true });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  fireEvent.click((await restoreButtons())[1]);
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Restaurar" }));
  const card = screen.getByRole("article", { name: "Arquivo do Hermes" });
  await expectText(card, "Passo único");

  // A lista foi recarregada: o texto que estava no arquivo entrou no topo, com o tamanho dele.
  const section = screen.getByRole("region", { name: "Backups" });
  await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(3));
  const rows = within(section).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("14 de set");
  expect(rows[0]).toHaveTextContent("71 B");

  // Desfazer: restaurar o backup do topo devolve o texto anterior.
  fireEvent.click((await restoreButtons())[0]);
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Restaurar" }));
  await expectText(card, "buscar fontes");
  await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(4));
});

test("quem não é o dono não vê a seção de backups e não a consulta", async () => {
  install({ owner: false });
  render(<NoteDetailScreen userId="user-1" noteId="skill-1" />);

  const card = await screen.findByRole("article", { name: "Arquivo do Hermes" });
  await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/ai/config/file")).toBe(true));
  expect(within(card).queryByText("Texto do arquivo")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Backups" })).not.toBeInTheDocument();
  expect(api.calls.some((call) => call.pathname === "/api/ai/config/backups")).toBe(false);
});
