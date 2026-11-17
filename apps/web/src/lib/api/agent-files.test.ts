import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeApi, type FakeApi } from "@/test/fake-api";
import { agentFileBackupFixture, agentFileFixture, agentFilesArea } from "@/test/fake-api/agent-files";
import { requestsArea } from "@/test/fake-api/requests";
import { ApiRequestError } from "./client-request";
import {
  listAgentFileBackups,
  listAgentFiles,
  readAgentFileText,
  requestAgentFileEdit,
  restoreAgentFileBackup,
} from "./agent-files";
import { getRequest, HermesOffError } from "./requests";

// A tela troca o authedFetch pela API falsa: a mesma costura dos outros testes de cliente.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const SKILL = "hermes/skills/pesquisa/SKILL.md";
const AGENT = "hermes/agents/planejador.md";
const SKILL_TEXT = "---\ndescription: Pesquisa na web\ntags: [web, busca]\n---\nPasso 1";
const OLD_TEXT = "Passo 0";
// Mesmo formato de id que a API grava: carimbo de data e número de sequência.
const OLD_BACKUP = "2026-11-10T10-00-00-000Z-0001.bak";

let api: FakeApi;

function install({ owner = true, hermes = "off" }: { owner?: boolean; hermes?: "on" | "off" } = {}) {
  api = createFakeApi({
    areas: [agentFilesArea({ owner, hermes }), requestsArea({ hermes })],
    seed: {
      agentFiles: [
        agentFileFixture({ path: SKILL, text: SKILL_TEXT }),
        agentFileFixture({ path: AGENT, text: "Planeja." }),
      ],
      agentFileBackups: [
        agentFileBackupFixture({ id: OLD_BACKUP, path: SKILL, text: OLD_TEXT, createdAt: "2026-11-10T10:00:00.000Z" }),
      ],
    },
  });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => install());

describe("o dono lê os arquivos", () => {
  test("lista os skills e agentes sem o texto, ordenados por caminho", async () => {
    const files = await listAgentFiles();

    expect(files).toEqual([
      { path: AGENT, kind: "agent", hash: expect.any(String), missing: false, tags: [], description: "" },
      { path: SKILL, kind: "skill", hash: expect.any(String), missing: false, tags: ["web", "busca"], description: "Pesquisa na web" },
    ]);
    expect(files[0]).not.toHaveProperty("text");
  });

  test("lê o texto atual de um arquivo", async () => {
    expect(await readAgentFileText(SKILL)).toBe(SKILL_TEXT);
  });

  test("um arquivo que sumiu da pasta continua legível pelo último texto conhecido e aparece como sumido", async () => {
    install();
    api.store.table("agentFiles").set(SKILL, agentFileFixture({ path: SKILL, text: SKILL_TEXT, missing: true }));

    expect(await readAgentFileText(SKILL)).toBe(SKILL_TEXT);
    expect((await listAgentFiles()).find((file) => file.path === SKILL)).toMatchObject({ missing: true });
  });

  test("lista os backups com id, caminho, data e tamanho, sem o texto, do mais novo para o mais antigo", async () => {
    const backups = await listAgentFileBackups(SKILL);

    expect(backups).toEqual([
      { id: OLD_BACKUP, path: SKILL, createdAt: "2026-11-10T10:00:00.000Z", sizeBytes: OLD_TEXT.length },
    ]);
    expect(backups[0]).not.toHaveProperty("text");
  });

  test("restaurar um backup troca o texto e guarda o texto substituído como um backup novo, que desfaz a restauração", async () => {
    const files = await restoreAgentFileBackup(SKILL, OLD_BACKUP);

    expect(files.map((file) => file.path)).toEqual([AGENT, SKILL]);
    expect(await readAgentFileText(SKILL)).toBe(OLD_TEXT);

    const backups = await listAgentFileBackups(SKILL);
    expect(backups).toHaveLength(2);
    expect(backups[0]).toMatchObject({ path: SKILL, sizeBytes: SKILL_TEXT.length });

    await restoreAgentFileBackup(SKILL, backups[0]!.id);
    expect(await readAgentFileText(SKILL)).toBe(SKILL_TEXT);
  });

  test("restaurar um backup que não existe responde não encontrado", async () => {
    await expect(restoreAgentFileBackup(SKILL, "backup-999999.bak")).rejects.toMatchObject({
      name: "ApiRequestError",
      kind: "not_found",
      status: 404,
    });
  });
});

describe("pedido de edição ao Hermes", () => {
  beforeEach(() => install({ hermes: "on" }));

  test("devolve o pedido inteiro, que se acompanha por getRequest", async () => {
    const request = await requestAgentFileEdit({ path: SKILL, request: "Troque o passo 1 por dois passos", clientMessageId: "edit-1" });

    expect(request).toMatchObject({ kind: "request", route: "hermes", status: "queued", text: "Troque o passo 1 por dois passos" });
    expect(request.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(await getRequest(request.id)).toMatchObject({ id: request.id, route: "hermes" });
  });

  test("reenviar o mesmo clientMessageId devolve o pedido já aceito", async () => {
    const first = await requestAgentFileEdit({ path: SKILL, request: "Troque o passo 1", clientMessageId: "edit-2" });
    const again = await requestAgentFileEdit({ path: SKILL, request: "Troque o passo 1", clientMessageId: "edit-2" });

    expect(again.id).toBe(first.id);
  });

  test("um corpo fora do contrato quebra no lugar do bug, como nas outras rotas", async () => {
    await expect(requestAgentFileEdit({ path: SKILL, request: "   ", clientMessageId: "edit-3" })).rejects.toThrow(
      /Fora do contrato em POST \/api\/ai\/config\/edit-request; corpo recebido/,
    );
  });

  test("com o Hermes desligado, vira HermesOffError", async () => {
    install({ hermes: "off" });

    await expect(requestAgentFileEdit({ path: SKILL, request: "Troque o passo 1", clientMessageId: "edit-4" })).rejects.toBeInstanceOf(
      HermesOffError,
    );
  });
});

describe("quem não é o dono", () => {
  beforeEach(() => install({ owner: false, hermes: "on" }));

  test("todas as rotas respondem sem permissão, inclusive a leitura da lista", async () => {
    const calls = [
      listAgentFiles(),
      readAgentFileText(SKILL),
      listAgentFileBackups(SKILL),
      restoreAgentFileBackup(SKILL, OLD_BACKUP),
      requestAgentFileEdit({ path: SKILL, request: "Troque o passo 1", clientMessageId: "edit-5" }),
    ];

    for (const call of calls) {
      await expect(call).rejects.toMatchObject({ name: "ApiRequestError", kind: "forbidden", status: 403 });
    }
  });

  test("o pedido de edição responde 403 antes de responder ao Hermes desligado", async () => {
    install({ owner: false, hermes: "off" });

    await expect(requestAgentFileEdit({ path: SKILL, request: "Troque o passo 1", clientMessageId: "edit-6" })).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});
