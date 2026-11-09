import { Logger } from "@nestjs/common";
import { Note, isAgentFileNoteType, type AgentFileNote } from "../../../domain";
import type { NoteRepository } from "../../../domain/ports";
import type { AgentFileEntry, AgentFilesService } from "./agent-files.service";

/** O nome da nota: a skill leva o nome da pasta, o agente o nome do arquivo. */
export function agentFileNoteName(entry: Pick<AgentFileEntry, "path" | "kind">): string {
  const parts = entry.path.split("/");
  const name = entry.kind === "skill" ? (parts.at(-2) ?? "skill") : (parts.at(-1) ?? "agent").replace(/\.md$/, "");
  return name || entry.kind;
}

/** A tag do tipo (`skill`/`agent`) e as tags de uso do cabecalho do arquivo. */
function desiredTags(entry: Pick<AgentFileEntry, "kind" | "tags">): string[] {
  return [...new Set([entry.kind, ...entry.tags])];
}

/**
 * Mantem uma nota `skill`/`agent` por arquivo da pasta de skills e agentes (ADR 0005, decisao 5).
 * A nota aponta para o arquivo (caminho, hash, se sumiu) e nunca guarda o texto. So existem notas do dono.
 * Toda nota leva a tag do seu tipo (`skill` ou `agent`) e as tags de uso do cabecalho do arquivo, inclusive as notas que ja existiam; tags que o dono pôs a mais ficam. Arquivo novo vira nota; arquivo alterado ou apagado atualiza a nota que ja existe.
 */
export class AgentFileNotesReconciler {
  private readonly logger = new Logger(AgentFileNotesReconciler.name);
  private queue: Promise<unknown> = Promise.resolve();
  private lastSignature = "";

  constructor(
    private readonly files: Pick<AgentFilesService, "entries" | "onReconciled">,
    private readonly notes: Pick<NoteRepository, "save" | "update" | "listByUserId">,
    private readonly ownerUserId: () => string | undefined,
  ) {}

  /** Sincroniza agora e a cada leitura da pasta em que algo mudou. */
  start(): Promise<void> {
    this.files.onReconciled((entries) => void this.sync(entries));
    return this.sync(this.files.entries());
  }

  sync(entries: readonly AgentFileEntry[]): Promise<void> {
    const result = this.queue.then(() => this.run(entries));
    this.queue = result.catch(() => undefined);
    return result.catch((error: unknown) => {
      this.lastSignature = "";
      this.logger.error("falha ao sincronizar as notas de skills e agentes", error instanceof Error ? error.stack : String(error));
    });
  }

  private async run(entries: readonly AgentFileEntry[]): Promise<void> {
    const owner = this.ownerUserId();
    if (!owner) return;
    const signature = JSON.stringify(entries.map((entry) => [entry.path, entry.hash, entry.missing, entry.tags, entry.description]));
    if (signature === this.lastSignature) return;

    const byPath = new Map<string, Note>();
    for (const note of await this.notes.listByUserId(owner)) {
      if (isAgentFileNoteType(note.type)) byPath.set((note.data as AgentFileNote).path, note);
    }
    for (const entry of entries) {
      const data: AgentFileNote = { path: entry.path, hash: entry.hash, missing: entry.missing, ...(entry.description ? { description: entry.description } : {}) };
      const existing = byPath.get(entry.path);
      if (!existing) {
        if (entry.missing) continue;
        await this.notes.save(Note.create({ userId: owner, type: entry.kind, name: agentFileNoteName(entry), data, tags: desiredTags(entry) }));
        continue;
      }
      const current = existing.data as AgentFileNote;
      const missingTags = desiredTags(entry).filter((tag) => !existing.tags.includes(tag));
      const tagged = missingTags.length === 0;
      if (current.hash === data.hash && current.missing === data.missing && current.description === data.description && tagged) continue;
      await this.notes.update(existing.revise({ data, tags: tagged ? existing.tags : [...existing.tags, ...missingTags] }), owner, existing.revision);
    }
    this.lastSignature = signature;
  }
}
