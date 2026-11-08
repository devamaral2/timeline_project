import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { z } from "zod";
import { InvalidInputError } from "../errors/agent.errors";
import {
  FACTORY_AGENT_CONFIG,
  activateAgentConfig,
  changedPinnedFields,
  factoryAgentConfig,
  parseAgentConfig,
  withFactoryPins,
  type AgentConfigDocuments,
} from "./agent-config";

/**
 * Skills e agentes como arquivos numa pasta compartilhada entre a API e o Hermes (ADR 0005, que
 * substitui o banco como fonte da configuracao). Os conteudos so existem aqui; o banco guarda notas que
 * apontam para os arquivos. Cada mudanca (da API ou do Hermes) deixa o texto anterior em `.backups/`,
 * e um arquivo da API que nao valida e desfeito na hora, para o fluxo nunca usar uma configuracao ruim.
 */

type DocumentKey = keyof AgentConfigDocuments;

/** Os quatro documentos da API, com o caminho relativo de cada um dentro da pasta. */
export const API_FILES: Readonly<Record<DocumentKey, string>> = {
  agents: "api/agents.json",
  jevRouting: "api/jev-routing.json",
  prompts: "api/prompts.json",
  skills: "api/skills.json",
};
const DOCUMENT_KEYS = Object.keys(API_FILES) as DocumentKey[];
const HERMES_DIR = "hermes";
const BACKUP_DIR = ".backups";
const MAX_HERMES_FILE_BYTES = 256 * 1024;
const BACKUP_ID = /^[\w.-]+\.(bak|rejected)$/;

export type AgentFileKind = "skill" | "agent";
export type AgentFileScope = "api" | "hermes";

/** O que as notas `skill`/`agent` mostram de um arquivo. Nunca o conteudo. */
export interface AgentFileEntry {
  path: string;
  scope: AgentFileScope;
  kind: AgentFileKind;
  hash: string;
  /** O arquivo sumiu da pasta; o ultimo texto continua guardado e pode ser restaurado. */
  missing: boolean;
  /** Ultima edicao recusada neste arquivo (some quando uma edicao valida o substitui). */
  rejection: { at: Date; reason: string } | null;
}

export interface AgentFileBackup {
  id: string;
  path: string;
  kind: "bak" | "rejected";
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
  rejection: { at: Date; reason: string } | null;
}

export interface AgentFilesOptions {
  /** Quantos backups ficam por arquivo; os mais antigos saem primeiro. */
  retention?: number;
  /** Intervalo da leitura da pasta (ms). Leitura periodica porque inotify nao atravessa todo volume montado. */
  pollMs?: number;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const asText = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function kindOf(path: string): AgentFileKind {
  if (path === API_FILES.skills) return "skill";
  if (path.startsWith("api/")) return "agent";
  return path.startsWith(`${HERMES_DIR}/agents/`) ? "agent" : "skill";
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
    /** Nomes das skills que existem em codigo: um skills.json com skill sem codigo e recusado. */
    private readonly knownSkills: readonly string[],
    options: AgentFilesOptions = {},
  ) {
    this.retention = options.retention ?? 50;
    this.pollMs = options.pollMs ?? 2000;
  }

  /**
   * Na subida: cria os arquivos que faltam a partir do padrao de fabrica, valida o que esta na pasta e o
   * ativa. Arquivo da API que nao valida vai para o backup (`.rejected`) e o padrao de fabrica volta no
   * lugar: um arquivo ruim nao impede a subida. Depois comeca a ler a pasta de tempos em tempos.
   */
  async start(): Promise<void> {
    await this.serial(async () => {
      await mkdir(join(this.dir, "api"), { recursive: true });
      await mkdir(join(this.dir, HERMES_DIR, "skills"), { recursive: true });
      await mkdir(join(this.dir, HERMES_DIR, "agents"), { recursive: true });
      await this.loadApiFiles();
      await this.scanHermes();
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

  /** Le a pasta agora: aceita edicoes validas, desfaz as invalidas, registra arquivos novos do Hermes. */
  reload(): Promise<void> {
    return this.serial(async () => {
      await this.checkApiFiles();
      await this.scanHermes();
      const entries = this.entries();
      for (const listener of this.listeners) listener(entries);
    });
  }

  entries(): AgentFileEntry[] {
    return [...this.tracked.entries()]
      .map(([path, item]) => ({
        path,
        scope: (path.startsWith(`${HERMES_DIR}/`) ? "hermes" : "api") as AgentFileScope,
        kind: kindOf(path),
        hash: item.hash,
        missing: item.missing,
        rejection: item.rejection,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Texto do arquivo como esta agora (ou o ultimo conhecido, se sumiu). */
  read(path: string): { path: string; text: string } {
    const item = this.tracked.get(path);
    if (!item) throw new AgentFileNotFoundError(path);
    return { path, text: item.text };
  }

  /** Publica uma edicao do dono nos quatro documentos da API: valida, guarda backup e grava. */
  publish(documents: unknown): Promise<AgentFileEntry[]> {
    return this.serial(async () => {
      const next = documents as AgentConfigDocuments;
      const validated = this.validate(next);
      const changed = changedPinnedFields(validated);
      if (changed.length > 0) {
        throw new InvalidInputError(
          `Só textos e limites são editáveis; o modelo de cada rota, o endpoint do JEV e a estrutura de rotas e skills são fixos. Campos alterados: ${changed.join(", ")}.`,
        );
      }
      await this.writeApi(next);
      activateAgentConfig(validated);
      return this.entries();
    });
  }

  /** Volta os quatro documentos da API ao padrao de fabrica (o que esta no repositorio). */
  restoreFactory(): Promise<AgentFileEntry[]> {
    return this.serial(async () => {
      await this.writeApi(FACTORY_AGENT_CONFIG);
      activateAgentConfig(factoryAgentConfig());
      return this.entries();
    });
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
      backups.push({ id, path, kind: id.endsWith(".rejected") ? "rejected" : "bak", createdAt: info.mtime, sizeBytes: info.size });
    }
    return backups.sort((a, b) => b.id.localeCompare(a.id));
  }

  /**
   * Restaura um backup no arquivo. Arquivo da API so volta se o conjunto continuar valido (o atual
   * fica em backup antes, entao a restauracao tambem se desfaz).
   */
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
      const key = DOCUMENT_KEYS.find((candidate) => API_FILES[candidate] === path);
      if (key) {
        const documents = this.currentDocuments();
        try {
          documents[key] = JSON.parse(text);
        } catch {
          throw new InvalidInputError("O backup não é um JSON válido.");
        }
        const validated = this.validate(withFactoryPins(documents));
        await this.writeApi(documents, [key]);
        activateAgentConfig(validated);
      } else {
        const current = this.tracked.get(path);
        if (current && !current.missing) await this.backup(path, current.text, "bak");
        await this.atomicWrite(path, text);
        this.tracked.set(path, { text, hash: sha(text), missing: false, rejection: null });
      }
      return this.entries();
    });
  }

  // --- API files -----------------------------------------------------------------------------

  private async loadApiFiles(): Promise<void> {
    const texts = await this.readApiTexts();
    const missing = DOCUMENT_KEYS.filter((key) => texts[key] === undefined);
    try {
      if (missing.length === DOCUMENT_KEYS.length) throw new Error("pasta sem arquivos");
      if (missing.length > 0) throw new Error(`arquivos ausentes: ${missing.map((key) => API_FILES[key]).join(", ")}`);
      const documents = this.parseTexts(texts as Record<DocumentKey, string>);
      // Os campos fixos e o conjunto de skills vem sempre do padrao de fabrica de hoje: um deploy que
      // troca o modelo ou acrescenta uma skill vale sem apagar os textos editados.
      const pinned = withFactoryPins(documents);
      const validated = this.validate(pinned);
      for (const key of DOCUMENT_KEYS) {
        const text = asText(pinned[key]);
        const previous = texts[key] as string;
        if (JSON.stringify(documents[key]) !== JSON.stringify(pinned[key])) {
          await this.backup(API_FILES[key], previous, "bak");
          await this.atomicWrite(API_FILES[key], text);
          this.setTracked(API_FILES[key], text);
        } else {
          this.setTracked(API_FILES[key], previous);
        }
      }
      activateAgentConfig(validated);
    } catch (error) {
      for (const key of DOCUMENT_KEYS) {
        const previous = texts[key];
        if (previous !== undefined) await this.backup(API_FILES[key], previous, "rejected");
        const text = asText(FACTORY_AGENT_CONFIG[key]);
        await this.atomicWrite(API_FILES[key], text);
        this.setTracked(API_FILES[key], text);
      }
      activateAgentConfig(factoryAgentConfig());
      this.logError(error, "arquivos da API indisponíveis; usando o padrão de fábrica");
    }
  }

  private async checkApiFiles(): Promise<void> {
    const texts = await this.readApiTexts();
    const changed = DOCUMENT_KEYS.filter((key) => {
      const known = this.tracked.get(API_FILES[key]);
      return texts[key] === undefined || !known || sha(texts[key] as string) !== known.hash;
    });
    if (changed.length === 0) return;
    let reason: string | null = null;
    let validated: ReturnType<typeof parseAgentConfig> | null = null;
    try {
      const merged = { ...this.currentTexts() };
      for (const key of changed) {
        const text = texts[key];
        if (text === undefined) throw new Error(`${API_FILES[key]}: arquivo removido`);
        merged[key] = text;
      }
      validated = this.validate(this.parseTexts(merged));
      const pins = changedPinnedFields(validated);
      if (pins.length > 0) {
        throw new Error(
          `Só textos e limites são editáveis; campos fixos alterados: ${pins.join(", ")}.`,
        );
      }
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    if (validated && reason === null) {
      for (const key of changed) {
        const path = API_FILES[key];
        const previous = this.tracked.get(path);
        if (previous) await this.backup(path, previous.text, "bak");
        this.setTracked(path, texts[key] as string);
      }
      activateAgentConfig(validated);
      return;
    }
    // Edicao invalida: o que foi gravado vai para o backup e o ultimo texto bom volta no lugar.
    for (const key of changed) {
      const path = API_FILES[key];
      const good = this.tracked.get(path);
      if (!good) continue;
      if (texts[key] !== undefined) await this.backup(path, texts[key] as string, "rejected");
      await this.atomicWrite(path, good.text);
      good.rejection = { at: new Date(), reason: reason ?? "edição inválida" };
    }
    this.logError(new Error(reason ?? "edição inválida"), "edição recusada; arquivo restaurado");
  }

  private async writeApi(documents: AgentConfigDocuments, only: DocumentKey[] = DOCUMENT_KEYS): Promise<void> {
    for (const key of only) {
      const path = API_FILES[key];
      const text = asText(documents[key]);
      const previous = this.tracked.get(path);
      if (previous && previous.text === text) continue;
      if (previous && !previous.missing) await this.backup(path, previous.text, "bak");
      await this.atomicWrite(path, text);
      this.setTracked(path, text);
    }
  }

  private async readApiTexts(): Promise<Partial<Record<DocumentKey, string>>> {
    const texts: Partial<Record<DocumentKey, string>> = {};
    for (const key of DOCUMENT_KEYS) {
      try {
        texts[key] = await readFile(join(this.dir, API_FILES[key]), "utf8");
      } catch {
        // ausente
      }
    }
    return texts;
  }

  private currentTexts(): Record<DocumentKey, string> {
    return Object.fromEntries(
      DOCUMENT_KEYS.map((key) => [key, this.tracked.get(API_FILES[key])?.text ?? asText(FACTORY_AGENT_CONFIG[key])]),
    ) as Record<DocumentKey, string>;
  }

  private currentDocuments(): AgentConfigDocuments {
    return this.parseTexts(this.currentTexts());
  }

  private parseTexts(texts: Record<DocumentKey, string>): AgentConfigDocuments {
    const documents: Partial<AgentConfigDocuments> = {};
    for (const key of DOCUMENT_KEYS) {
      try {
        documents[key] = JSON.parse(texts[key]);
      } catch (error) {
        throw new Error(`${API_FILES[key]}: JSON inválido (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    return documents as AgentConfigDocuments;
  }

  private validate(documents: AgentConfigDocuments) {
    try {
      return parseAgentConfig(documents, this.knownSkills);
    } catch (error) {
      if (error instanceof z.ZodError) throw new InvalidInputError(z.prettifyError(error));
      throw new InvalidInputError(error instanceof Error ? error.message : String(error));
    }
  }

  // --- Hermes files --------------------------------------------------------------------------

  private async scanHermes(): Promise<void> {
    const found = new Map<string, string>();
    await this.walk(join(this.dir, HERMES_DIR), HERMES_DIR, found);
    for (const [path, text] of found) {
      const known = this.tracked.get(path);
      const hash = sha(text);
      if (known && known.hash === hash && !known.missing) continue;
      if (known && !known.missing) await this.backup(path, known.text, "bak");
      this.tracked.set(path, { text, hash, missing: false, rejection: null });
    }
    for (const [path, item] of this.tracked) {
      if (path.startsWith(`${HERMES_DIR}/`) && !found.has(path)) item.missing = true;
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
      const childAbsolute = join(absolute, name);
      const childRelative = `${relative}/${name}`;
      const info = await stat(childAbsolute);
      if (info.isDirectory()) await this.walk(childAbsolute, childRelative, found);
      else if (info.isFile() && name.endsWith(".md") && info.size <= MAX_HERMES_FILE_BYTES) {
        found.set(childRelative, await readFile(childAbsolute, "utf8"));
      }
    }
  }

  // --- helpers -------------------------------------------------------------------------------

  private setTracked(path: string, text: string): void {
    this.tracked.set(path, { text, hash: sha(text), missing: false, rejection: null });
  }

  private assertTracked(path: string): void {
    if (!this.tracked.has(path)) throw new AgentFileNotFoundError(path);
  }

  private async backup(path: string, text: string, kind: "bak" | "rejected"): Promise<void> {
    const folder = join(this.dir, BACKUP_DIR, path);
    await mkdir(folder, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(join(folder, `${stamp}.${sha(text).slice(0, 8)}.${kind}`), text, "utf8");
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

  private logError(error: unknown, message = "falha ao ler a pasta de skills e agentes"): void {
    console.error(`[AgentFilesService] ${message}`, error);
  }
}
