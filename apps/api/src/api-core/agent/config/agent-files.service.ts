import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { InvalidInputError } from "../errors/agent.errors";

/**
 * Skills e agentes do Hermes como arquivos numa pasta compartilhada entre a API e o Hermes (ADR 0005).
 * Os conteudos so existem aqui; o banco guarda notas que apontam para os arquivos. O Hermes edita a
 * pasta; a API le de tempos em tempos, registra o que mudou e guarda o texto anterior em `.backups/`,
 * para que qualquer edicao possa ser desfeita.
 */

const HERMES_DIR = "hermes";
const BACKUP_DIR = ".backups";
const MAX_FILE_BYTES = 256 * 1024;
const BACKUP_ID = /^[\w.-]+\.bak$/;

export type AgentFileKind = "skill" | "agent";

/** O que as notas `skill`/`agent` mostram de um arquivo. Nunca o conteudo. */
export interface AgentFileEntry {
  /** Caminho relativo a pasta, sempre com `/`. */
  path: string;
  kind: AgentFileKind;
  hash: string;
  /** O arquivo sumiu da pasta; o ultimo texto continua guardado e pode ser restaurado. */
  missing: boolean;
  /** Tags de uso declaradas no cabecalho (frontmatter) do arquivo, em minusculas. */
  tags: string[];
  /** O `description` do cabecalho do arquivo; vazio quando nao ha. */
  description: string;
}

export interface AgentFileBackup {
  id: string;
  path: string;
  createdAt: Date;
  sizeBytes: number;
}

export class AgentFileNotFoundError extends Error {
  constructor(what: string) {
    super(`Arquivo ou backup não encontrado: ${what}`);
    this.name = "AgentFileNotFoundError";
  }
}

interface Tracked {
  text: string;
  hash: string;
  missing: boolean;
}

export interface AgentFilesOptions {
  /** Quantos backups ficam por arquivo; os mais antigos saem primeiro. */
  retention?: number;
  /** Intervalo da leitura da pasta (ms). Leitura periodica porque inotify nao atravessa todo volume montado. */
  pollMs?: number;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

function kindOf(path: string): AgentFileKind {
  return path.startsWith(`${HERMES_DIR}/agents/`) ? "agent" : "skill";
}

/**
 * So o que e skill ou agente: `SKILL.md` de cada skill e os `.md` de `hermes/agents/`. O resto da pasta de
 * skills (DESCRIPTION.md, referencias, scripts, estado do Hermes) e do Hermes e nao vira nota.
 */
function isTracked(path: string): boolean {
  if (path.startsWith(`${HERMES_DIR}/agents/`)) return path.endsWith(".md");
  return path.startsWith(`${HERMES_DIR}/skills/`) && path.endsWith("/SKILL.md");
}

function splitTags(value: string): string[] {
  return value.split(",").map((tag) => tag.trim().replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}

/**
 * As tags de uso no cabecalho `---` do arquivo: a chave `tags` em qualquer nivel (`tags:` solta ou
 * `metadata.hermes.tags`), como lista `[a, b]`, lista com `- a` ou texto separado por virgulas.
 */
export function parseFrontmatterTags(text: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return [];
  const lines = (match[1] ?? "").split(/\r?\n/);
  const tags: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const key = /^(\s*)tags\s*:\s*(.*)$/.exec(lines[index] ?? "");
    if (!key) continue;
    const indent = key[1]?.length ?? 0;
    const inline = (key[2] ?? "").replace(/\s+#.*$/, "").trim();
    if (inline) {
      tags.push(...splitTags(inline.replace(/^\[/, "").replace(/\]$/, "")));
      continue;
    }
    for (let next = index + 1; next < lines.length; next += 1) {
      const item = /^(\s*)-\s+(.*)$/.exec(lines[next] ?? "");
      if (!item || (item[1]?.length ?? 0) < indent) break;
      tags.push(...splitTags((item[2] ?? "").replace(/\s+#.*$/, "")));
    }
  }
  return [...new Set(tags.map((tag) => tag.toLowerCase()))];
}

/** O `description` do cabecalho `---`: texto numa linha, entre aspas ou em bloco (`>`, `>-`, `|`), unido em uma linha so. */
export function parseFrontmatterDescription(text: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return "";
  const lines = (match[1] ?? "").split(/\r?\n/);
  const index = lines.findIndex((line) => /^description\s*:/.test(line));
  if (index < 0) return "";
  const inline = (lines[index] ?? "").replace(/^description\s*:\s*/, "").trim();
  if (inline && !/^[>|][+-]?$/.test(inline)) return inline.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
  const parts: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() && !/^\s/.test(line)) break;
    if (line.trim()) parts.push(line.trim());
  }
  return parts.join(" ");
}

export class AgentFilesService {
  private readonly retention: number;
  private readonly pollMs: number;
  private readonly tracked = new Map<string, Tracked>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;
  private listeners: Array<(entries: AgentFileEntry[]) => void> = [];

  constructor(
    private readonly dir: string,
    options: AgentFilesOptions = {},
  ) {
    this.retention = options.retention ?? 50;
    this.pollMs = options.pollMs ?? 2000;
  }

  /** Cria as pastas que faltam, registra o que ja existe nelas e comeca a ler a pasta de tempos em tempos. */
  async start(): Promise<void> {
    await this.serial(async () => {
      await mkdir(join(this.dir, HERMES_DIR, "skills"), { recursive: true });
      await mkdir(join(this.dir, HERMES_DIR, "agents"), { recursive: true });
      await this.scan();
    });
    if (this.pollMs > 0 && !this.timer) {
      this.timer = setInterval(() => void this.reload().catch((error) => this.logError(error)), this.pollMs);
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Avisa quando uma leitura da pasta termina (para as notas acompanharem os arquivos). */
  onReconciled(listener: (entries: AgentFileEntry[]) => void): void {
    this.listeners.push(listener);
  }

  /** Le a pasta agora: registra arquivos novos, guarda backup do que mudou e marca o que sumiu. */
  reload(): Promise<void> {
    return this.serial(async () => {
      await this.scan();
      const entries = this.entries();
      for (const listener of this.listeners) listener(entries);
    });
  }

  entries(): AgentFileEntry[] {
    return [...this.tracked.entries()]
      .map(([path, item]) => ({ path, kind: kindOf(path), hash: item.hash, missing: item.missing, tags: parseFrontmatterTags(item.text), description: parseFrontmatterDescription(item.text) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Texto do arquivo como esta agora (ou o ultimo conhecido, se sumiu). */
  read(path: string): { path: string; text: string } {
    const item = this.tracked.get(path);
    if (!item) throw new AgentFileNotFoundError(path);
    return { path, text: item.text };
  }

  async listBackups(path: string): Promise<AgentFileBackup[]> {
    this.assertTracked(path);
    const folder = join(this.dir, BACKUP_DIR, path);
    let names: string[];
    try {
      names = await readdir(folder);
    } catch {
      return [];
    }
    const backups: AgentFileBackup[] = [];
    for (const id of names.filter((name) => BACKUP_ID.test(name))) {
      const info = await stat(join(folder, id));
      backups.push({ id, path, createdAt: info.mtime, sizeBytes: info.size });
    }
    return backups.sort((a, b) => b.id.localeCompare(a.id));
  }

  /** Restaura um backup no arquivo. O texto atual vai para backup antes, entao a restauracao tambem se desfaz. */
  restoreBackup(path: string, id: string): Promise<AgentFileEntry[]> {
    return this.serial(async () => {
      this.assertTracked(path);
      if (!BACKUP_ID.test(id)) throw new AgentFileNotFoundError(id);
      let text: string;
      try {
        text = await readFile(join(this.dir, BACKUP_DIR, path, id), "utf8");
      } catch {
        throw new AgentFileNotFoundError(id);
      }
      const current = this.tracked.get(path);
      if (current && !current.missing) await this.backup(path, current.text);
      await this.atomicWrite(path, text);
      this.tracked.set(path, { text, hash: sha(text), missing: false });
      return this.entries();
    });
  }

  /**
   * Grava o texto novo de um arquivo que ja e conhecido (edicao pelo app, ADR 0006). O texto anterior vai para
   * backup antes, entao a edicao tambem se desfaz. Quem escreve nao cria arquivos nem escolhe caminho: so troca
   * o texto de um skill ou agente que a pasta ja tem. Sessoes do Hermes que ja leram o arquivo nao mudam; as novas
   * leem o texto novo.
   */
  write(path: string, text: string): Promise<AgentFileEntry[]> {
    return this.serial(async () => {
      this.assertTracked(path);
      if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) throw new InvalidInputError("O arquivo passou do limite de 256 KB.");
      const current = this.tracked.get(path);
      if (current && !current.missing && current.text === text) return this.entries();
      if (current && !current.missing) await this.backup(path, current.text);
      await this.atomicWrite(path, text);
      this.tracked.set(path, { text, hash: sha(text), missing: false });
      const entries = this.entries();
      for (const listener of this.listeners) listener(entries);
      return entries;
    });
  }

  // --- helpers -------------------------------------------------------------------------------

  private async scan(): Promise<void> {
    const found = new Map<string, string>();
    await this.walk(join(this.dir, HERMES_DIR), HERMES_DIR, found);
    for (const [path, text] of found) {
      const known = this.tracked.get(path);
      const hash = sha(text);
      if (known && known.hash === hash && !known.missing) continue;
      if (known && !known.missing) await this.backup(path, known.text);
      this.tracked.set(path, { text, hash, missing: false });
    }
    for (const [path, item] of this.tracked) {
      if (!found.has(path)) item.missing = true;
    }
  }

  private async walk(absolute: string, relative: string, found: Map<string, string>): Promise<void> {
    let names: string[];
    try {
      names = await readdir(absolute);
    } catch {
      return;
    }
    for (const name of names) {
      // Pastas ocultas (.locks, .curator_backups...) sao estado do Hermes, nao skills.
      if (name.startsWith(".")) continue;
      const childAbsolute = join(absolute, name);
      const childRelative = `${relative}/${name}`;
      const info = await stat(childAbsolute);
      if (info.isDirectory()) await this.walk(childAbsolute, childRelative, found);
      else if (info.isFile() && isTracked(childRelative) && info.size <= MAX_FILE_BYTES) {
        found.set(childRelative, await readFile(childAbsolute, "utf8"));
      }
    }
  }

  private assertTracked(path: string): void {
    if (!this.tracked.has(path)) throw new AgentFileNotFoundError(path);
  }

  private async backup(path: string, text: string): Promise<void> {
    const folder = join(this.dir, BACKUP_DIR, path);
    await mkdir(folder, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(join(folder, `${stamp}.${sha(text).slice(0, 8)}.bak`), text, "utf8");
    const names = (await readdir(folder)).filter((name) => BACKUP_ID.test(name)).sort();
    for (const old of names.slice(0, Math.max(0, names.length - this.retention))) {
      await rm(join(folder, old), { force: true });
    }
  }

  /** Escreve em arquivo temporario e renomeia: quem le (o Hermes) nunca ve o arquivo pela metade. */
  private async atomicWrite(path: string, text: string): Promise<void> {
    const target = join(this.dir, normalize(path));
    if (!target.startsWith(this.dir + sep)) throw new InvalidInputError("Caminho fora da pasta.");
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, text, "utf8");
    await rename(temporary, target);
  }

  private serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private logError(error: unknown): void {
    console.error("[AgentFilesService] falha ao ler a pasta de skills e agentes do Hermes", error);
  }
}
