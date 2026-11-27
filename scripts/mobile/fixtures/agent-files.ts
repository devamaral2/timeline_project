/**
 * Fixtures dos arquivos do agente (skills e agentes do Hermes, ADR 0005): as respostas de `GET /api/ai/config/file`,
 * `GET /api/ai/config/backups`, `POST /api/ai/config/restore` e `POST /api/ai/config/edit-request`, e as saídas das
 * funções do web que a vista do arquivo usa.
 *
 * Os formatos de arquivo não estão em `packages/contracts`: moram em `apps/api/src/common/openapi-operations.ts`
 * (importá-lo puxaria os controladores do Nest), então os schemas abaixo repetem os de lá. O pedido de edição devolve o
 * `requestSchema` do contrato. `splitFrontmatter`, `whenLabel` e `sizeLabel` moram em componentes `"use client"` que o
 * tsx não carrega; as expressões são repetidas aqui, iguais às do web (`AgentFileNoteView.tsx`, `AgentFileBackups.tsx`).
 */
import { requestSchema } from "../../../packages/contracts/src/schemas";
import { TIMELINE_TIME_ZONE } from "../../../packages/timeline/src/index";
import type { FixtureContext } from "../generate-fixtures";
import { PERSONAL_PROJECT } from "./project";

/** Cópia literal de `AgentFileNoteView.tsx`. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function splitFrontmatter(text: string): { summary: string[]; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { summary: [], body: text };
  return { summary: match[1].split(/\r?\n/).filter((line) => line.trim() !== ""), body: text.slice(match[0].length) };
}

/** A linha do sumário como `FileSummary` a divide: `chave:` em destaque e o valor, ou a linha crua. */
function summaryLine(line: string): { key: string | null; value: string | null; line: string } {
  const split = /^([\w.-]+):(?:\s+(.*))?$/.exec(line);
  return split ? { key: split[1], value: split[2] ?? null, line } : { key: null, value: null, line };
}

/** Cópias literais de `AgentFileBackups.tsx`. */
const whenFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: TIMELINE_TIME_ZONE });
const decimalFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function whenLabel(iso: string): string {
  return whenFormat.format(new Date(iso));
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${decimalFormat.format(bytes / 1024)} KB`;
  return `${decimalFormat.format(bytes / (1024 * 1024))} MB`;
}

const SKILL_PATH = "hermes/skills/pesquisar/SKILL.md";
const SKILL_TEXT = [
  "---",
  "name: pesquisar",
  "description: Pesquisa na web e resume os achados",
  "allowed-tools: web.search, web.fetch",
  "---",
  "",
  "# Pesquisar",
  "",
  "Procure em **fontes confiáveis** e resuma.",
  "",
  "- Cite a fonte",
  "- Diga o que não achou",
].join("\n");
const PLAIN_TEXT = "# Planejador\n\nMonta o dia a partir das tarefas abertas.\n";

const TEXTS = [
  SKILL_TEXT,
  PLAIN_TEXT,
  "",
  "---\r\nname: crlf\r\ndescription: Termina em CRLF\r\n---\r\n\r\nCorpo com CRLF\r\n",
  "---\nname: sem corpo\n---",
  "---\nname: com linha em branco\n\n# comentário solto\nchave sem valor:\n---\nCorpo",
  "texto antes\n---\nname: não é cabeçalho\n---\n",
  "---\nnão fechou\n# Título\n",
];

const BYTES = [0, 1, 512, 1023, 1024, 1536, 1640, 2048, 10_240, 1_048_575, 1_048_576, 1_572_864, 5_242_880, 123_456_789];

const INSTANTS = [
  "2026-09-14T12:30:00.000Z",
  "2026-09-14T03:00:00.000Z",
  "2026-09-14T02:59:00.000Z",
  "2026-01-05T02:05:00.000Z",
  "2026-05-01T03:00:00.000Z",
  "2026-12-31T23:59:00.000Z",
  "2026-03-10T15:00:00.000Z",
  "2025-11-02T14:45:00.000Z",
];

const BACKUPS = [
  { id: "bk-3", path: SKILL_PATH, createdAt: "2026-09-14T12:30:00.000Z", sizeBytes: 1640 },
  { id: "bk-2", path: SKILL_PATH, createdAt: "2026-09-10T18:05:00.000Z", sizeBytes: 512 },
  { id: "bk-1", path: SKILL_PATH, createdAt: "2026-09-01T09:00:00.000Z", sizeBytes: 2_621_440 },
];

export function agentFileFixtures({ z }: FixtureContext): Record<string, unknown> {
  const entrySchema = z.object({
    path: z.string(), kind: z.enum(["skill", "agent"]), hash: z.string(), missing: z.boolean(),
    tags: z.array(z.string()), description: z.string(),
  });
  const textSchema = z.object({ path: z.string(), text: z.string() });
  const backupsSchema = z.object({
    backups: z.array(z.object({ id: z.string(), path: z.string(), createdAt: z.iso.datetime(), sizeBytes: z.number().int() })),
  });
  const listSchema = z.object({ files: z.array(entrySchema) });

  const entry = (hash: string, missing = false) => ({
    path: SKILL_PATH, kind: "skill", hash, missing, tags: ["pesquisa"], description: "Pesquisa na web",
  });
  const other = { path: "hermes/agents/planejador.md", kind: "agent", hash: "ffffffff00000000", missing: false, tags: [], description: "" };

  const edit = (input: Record<string, unknown>) =>
    requestSchema.parse({
      kind: "request",
      route: "hermes",
      status: "running",
      title: "Editar pesquisar/SKILL.md",
      project: PERSONAL_PROJECT,
      createdAt: "2026-09-14T14:48:00.000Z",
      updatedAt: "2026-09-14T14:49:00.000Z",
      steps: [],
      entities: [],
      ...input,
    });
  const running = edit({ id: "req-edit", progress: "Avaliando o impacto da mudança…" });

  return {
    "agent-file-text": textSchema.parse({ path: SKILL_PATH, text: SKILL_TEXT }),
    "agent-file-text-edited": textSchema.parse({ path: SKILL_PATH, text: `${SKILL_TEXT}\n- Responda em português` }),
    "agent-file-text-restored": textSchema.parse({ path: SKILL_PATH, text: "# Pesquisar\n\nVersão restaurada." }),
    "agent-file-backups": backupsSchema.parse({ backups: BACKUPS }),
    "agent-file-backups-after-restore": backupsSchema.parse({
      backups: [{ id: "bk-4", path: SKILL_PATH, createdAt: "2026-09-14T15:00:00.000Z", sizeBytes: 1700 }, ...BACKUPS],
    }),
    "agent-file-backups-empty": backupsSchema.parse({ backups: [] }),
    "agent-file-list": listSchema.parse({ files: [other, entry("abc12345deadbeef")] }),
    "agent-file-restore": listSchema.parse({ files: [other, entry("99887766aabbccdd")] }),
    "agent-file-restore-missing": listSchema.parse({ files: [other, entry("99887766aabbccdd", true)] }),
    "agent-file-edit-accepted": edit({ id: "req-edit", status: "queued" }),
    "agent-file-edit-running": running,
    "agent-file-edit-running-step": edit({
      id: "req-edit",
      steps: [{ id: "s1", agent: "hermes", label: "Reescrevendo o arquivo", status: "running" }],
    }),
    "agent-file-edit-done": edit({
      id: "req-edit", status: "done", message: "Pronto: acrescentei a regra de responder em português.",
    }),
    "agent-file-edit-done-bare": edit({ id: "req-edit", status: "done" }),
    "agent-file-edit-failed": edit({ id: "req-edit", status: "failed", errorCode: "unavailable" }),
    "agent-file-edit-cancelled": edit({ id: "req-edit", status: "cancel" }),
    "agent-file-model": {
      frontmatter: TEXTS.map((text) => {
        const { summary, body } = splitFrontmatter(text);
        return { text, summary: summary.map(summaryLine), body };
      }),
      sizes: BYTES.map((bytes) => ({ bytes, label: sizeLabel(bytes) })),
      whens: INSTANTS.map((instant) => ({ instant, label: whenLabel(instant) })),
      versions: ["abc12345deadbeef", "abc", ""].map((hash) => ({ hash, label: hash.slice(0, 8) })),
    },
  };
}
