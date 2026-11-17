import type { RequestDto } from "@repo/contracts";
import { requestSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";

/**
 * Área dos arquivos do agente (skills e agentes do Hermes): listar, ler o texto, listar backups, restaurar um
 * backup e pedir uma edição ao Hermes. Só o dono acessa; para quem não é, todas as rotas respondem 403.
 *
 * O teste escolhe se o usuário é o dono: `agentFilesArea({ owner: true })` ou `{ owner: false }`.
 *
 * Os formatos não estão no pacote de contratos: declarados aqui, com a forma que a API devolve
 * (`apps/api/src/common/openapi-operations.ts`: `AgentFileList`, `AgentFileText`, `AgentFileBackupList`,
 * `AgentFileEditRequest`, `RestoreAgentFileRequest`). O pedido de edição devolve um `Request`, como o da área de pedidos.
 */

const FILES = "agentFiles";
const BACKUPS = "agentFileBackups";
const EDIT_REQUESTS = "agentFileEditRequests";
const REQUESTS = "requests";

const configPath = z.string().min(1).max(300);

const agentFileSchema = z.object({
  path: z.string(),
  kind: z.enum(["skill", "agent"]),
  hash: z.string(),
  missing: z.boolean(),
  tags: z.array(z.string()),
  description: z.string(),
});
const fileListSchema = z.object({ files: z.array(agentFileSchema) });
const fileTextSchema = z.object({ path: z.string(), text: z.string() });
const backupListSchema = z.object({
  backups: z.array(z.object({ id: z.string(), path: z.string(), createdAt: z.iso.datetime(), sizeBytes: z.number().int() })),
});
const restoreBody = z.object({ path: configPath, backupId: z.string().min(1).max(200) });
const editRequestBody = z.object({
  path: configPath,
  request: z.string().trim().min(1).max(4000),
  clientMessageId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});

/** Uma linha da pasta: o texto atual (ou o último conhecido, se sumiu). */
export interface AgentFileRow {
  id: string;
  path: string;
  text: string;
  missing: boolean;
}

export interface AgentFileBackupRow {
  id: string;
  path: string;
  text: string;
  createdAt: string;
}

export interface AgentFilesAreaOptions {
  /** `true` quando o usuário da sessão é o dono (`AGENT_CONFIG_OWNER_USER_ID`). */
  owner: boolean;
  /** Como `AI_AUTOMATION` da API. Padrão `off`: o pedido de edição responde 404 depois da checagem do dono. */
  hermes?: "on" | "off";
}

/** Um arquivo que a pasta tem, para semear a API falsa. Skill ou agente sai do caminho. */
export function agentFileFixture(overrides: { path: string; text: string; missing?: boolean }): AgentFileRow {
  return { id: overrides.path, path: overrides.path, text: overrides.text, missing: overrides.missing ?? false };
}

/** Um backup já guardado de um arquivo, para semear a API falsa. */
export function agentFileBackupFixture(overrides: { id: string; path: string; text: string; createdAt: string }): AgentFileBackupRow {
  return { ...overrides };
}

export function agentFilesArea(options: AgentFilesAreaOptions): FakeArea {
  const { owner } = options;
  const hermesOn = options.hermes === "on";
  const forbidden: FakeResult = { status: 403 };

  return {
    name: "arquivos do agente",
    routes: [
      {
        method: "GET",
        path: "/api/ai/config",
        output: fileListSchema,
        handle: (_request, store) => (owner ? { status: 200, body: { files: listFiles(store) } } : forbidden),
      },
      {
        method: "GET",
        path: "/api/ai/config/file",
        output: fileTextSchema,
        handle: (request, store) => {
          if (!owner) return forbidden;
          const path = request.query.get("path");
          if (!path) return { status: 400 };
          const row = files(store).get(path);
          if (!row) return { status: 404 };
          return { status: 200, body: { path, text: row.text } };
        },
      },
      {
        method: "GET",
        path: "/api/ai/config/backups",
        output: backupListSchema,
        handle: (request, store) => {
          if (!owner) return forbidden;
          const path = request.query.get("path");
          if (!path) return { status: 400 };
          if (!files(store).has(path)) return { status: 404 };
          return { status: 200, body: { backups: listBackups(store, path) } };
        },
      },
      {
        method: "POST",
        path: "/api/ai/config/restore",
        input: restoreBody,
        output: fileListSchema,
        handle: (request, store) => {
          if (!owner) return forbidden;
          const body = request.body as z.infer<typeof restoreBody>;
          const row = files(store).get(body.path);
          if (!row) return { status: 404 };
          const backup = backups(store).get(body.backupId);
          if (!backup || backup.path !== body.path) return { status: 404 };
          // O texto substituído vira backup novo, então a restauração se desfaz. Arquivo sumido não guarda nada.
          if (!row.missing) addBackup(store, body.path, row.text);
          files(store).set(body.path, { ...row, text: backup.text, missing: false });
          return { status: 201, body: { files: listFiles(store) } };
        },
      },
      // Desligado, a API confere o dono (403) e responde 404 antes de ler o corpo: a rota fica sem `input`.
      hermesOn
        ? {
            method: "POST",
            path: "/api/ai/config/edit-request",
            input: editRequestBody,
            output: requestSchema,
            handle: (request, store) => editRequest(request, store, owner),
          }
        : {
            method: "POST",
            path: "/api/ai/config/edit-request",
            handle: () => (owner ? { status: 404 } : forbidden),
          },
    ],
  };
}

function files(store: FakeStore) {
  return store.table<AgentFileRow>(FILES);
}

function backups(store: FakeStore) {
  return store.table<AgentFileBackupRow>(BACKUPS);
}

function requests(store: FakeStore) {
  return store.table<RequestDto>(REQUESTS);
}

function editRequests(store: FakeStore) {
  return store.table<string>(EDIT_REQUESTS);
}

function kindOf(path: string): "skill" | "agent" {
  return path.startsWith("hermes/agents/") ? "agent" : "skill";
}

/** Cabeçalho `---` do arquivo: a parte entre as duas linhas de traço. */
function frontmatter(text: string): string {
  return /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
}

function descriptionOf(text: string): string {
  return /^description:\s*(.*)$/m.exec(frontmatter(text))?.[1]?.trim() ?? "";
}

function tagsOf(text: string): string[] {
  const inline = /^tags:\s*\[(.*)\]\s*$/m.exec(frontmatter(text))?.[1];
  if (inline === undefined) return [];
  return [...new Set(inline.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

/** FNV-1a de 32 bits em hexadecimal: estável para o mesmo texto, diferente quando o texto muda. */
function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function listFiles(store: FakeStore) {
  return [...files(store).values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((row) => ({
      path: row.path,
      kind: kindOf(row.path),
      hash: hashOf(row.text),
      missing: row.missing,
      tags: tagsOf(row.text),
      description: descriptionOf(row.text),
    }));
}

/** Do mais novo para o mais antigo, por id (o carimbo de data vem na frente do id). */
function listBackups(store: FakeStore, path: string) {
  return [...backups(store).values()]
    .filter((backup) => backup.path === path)
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .map((backup) => ({
      id: backup.id,
      path: backup.path,
      createdAt: backup.createdAt,
      sizeBytes: new TextEncoder().encode(backup.text).byteLength,
    }));
}

function addBackup(store: FakeStore, path: string, text: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sequence = store.nextId("agentBackup").slice("agentBackup-".length).padStart(4, "0");
  const id = `${stamp}-${sequence}.bak`;
  backups(store).set(id, { id, path, text, createdAt: new Date().toISOString() });
}

/** Mesmo formato de id dos pedidos da área de pedidos: ULID de 26 caracteres de Crockford. */
function newRequestId(store: FakeStore): string {
  const n = Number(store.nextId("request").slice("request-".length));
  return `R${String(n).padStart(25, "0")}`;
}

function editRequest(request: FakeRequest, store: FakeStore, owner: boolean): FakeResult {
  if (!owner) return { status: 403 };
  const body = request.body as z.infer<typeof editRequestBody>;
  if (!files(store).has(body.path)) return { status: 404 };
  // Reenviar o mesmo clientMessageId devolve o pedido já aceito, sem uma segunda mensagem ao Hermes.
  const again = editRequests(store).get(body.clientMessageId);
  if (again !== undefined) return { status: 202, body: requests(store).get(again) };

  const id = newRequestId(store);
  const now = new Date().toISOString();
  const title = body.request.split("\n")[0]?.trim() ?? "";
  const accepted = requestSchema.parse({
    id,
    kind: "request",
    route: "hermes",
    status: "queued",
    title: title.length <= 80 ? title : `${title.slice(0, 79)}…`,
    text: body.request,
    createdAt: now,
    updatedAt: now,
    steps: [],
    entities: [],
  }) as RequestDto;
  requests(store).set(id, accepted);
  editRequests(store).set(body.clientMessageId, id);
  return { status: 202, body: accepted };
}
