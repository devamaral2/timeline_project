import { Logger } from "@nestjs/common";
import { Artifact, isAgentFileArtifactType, type AgentFileData } from "../../../domain";
import type { ArtifactRepository } from "../../../domain/ports";
import type { AgentFileEntry, AgentFilesService } from "./agent-files.service";

/** O nome do artefato: a skill leva o nome da pasta, o agente o nome do arquivo. */
export function agentFileArtifactName(entry: Pick<AgentFileEntry, "path" | "kind">): string {
  const parts = entry.path.split("/");
  const name = entry.kind === "skill" ? (parts.at(-2) ?? "skill") : (parts.at(-1) ?? "agent").replace(/\.md$/, "");
  return name || entry.kind;
}

/** A tag do tipo (`skill`/`agent`) e as tags de uso do cabecalho do arquivo. */
function desiredTags(entry: Pick<AgentFileEntry, "kind" | "tags">): string[] {
  return [...new Set([entry.kind, ...entry.tags])];
}

/**
 * Mantem um artefato `skill`/`agent` por arquivo da pasta de skills e agentes (ADR 0005, decisao 5).
 * O artefato aponta para o arquivo (caminho, hash, se sumiu) e nunca guarda o texto. So existem artefatos do dono.
 * Todo artefato leva a tag do seu tipo (`skill` ou `agent`) e as tags de uso do cabecalho do arquivo, inclusive os
 * que ja existiam; tags que o dono pos a mais ficam. Arquivo novo vira artefato; arquivo alterado ou apagado
 * atualiza o artefato que ja existe.
 */
export class AgentFileArtifactsReconciler {
  private readonly logger = new Logger(AgentFileArtifactsReconciler.name);
  private queue: Promise<unknown> = Promise.resolve();
  private lastSignature = "";

  constructor(
    private readonly files: Pick<AgentFilesService, "entries" | "onReconciled">,
    private readonly artifacts: Pick<ArtifactRepository, "save" | "update" | "listByUserId">,
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
      this.logger.error("falha ao sincronizar os artefatos de skills e agentes", error instanceof Error ? error.stack : String(error));
    });
  }

  private async run(entries: readonly AgentFileEntry[]): Promise<void> {
    const owner = this.ownerUserId();
    if (!owner) return;
    const signature = JSON.stringify(entries.map((entry) => [entry.path, entry.hash, entry.missing, entry.tags, entry.description]));
    if (signature === this.lastSignature) return;

    const byPath = new Map<string, Artifact>();
    for (const artifact of await this.artifacts.listByUserId(owner, { types: ["skill", "agent"] })) {
      if (isAgentFileArtifactType(artifact.type)) byPath.set((artifact.data as AgentFileData).path, artifact);
    }
    for (const entry of entries) {
      const data: AgentFileData = { path: entry.path, hash: entry.hash, missing: entry.missing, ...(entry.description ? { description: entry.description } : {}) };
      const existing = byPath.get(entry.path);
      if (!existing) {
        if (entry.missing) continue;
        await this.artifacts.save(Artifact.create({ userId: owner, type: entry.kind, name: agentFileArtifactName(entry), data, tags: desiredTags(entry) }));
        continue;
      }
      const current = existing.data as AgentFileData;
      const missingTags = desiredTags(entry).filter((tag) => !existing.tags.includes(tag));
      const tagged = missingTags.length === 0;
      if (current.hash === data.hash && current.missing === data.missing && current.description === data.description && tagged) continue;
      await this.artifacts.update(existing.revise({ data, tags: tagged ? existing.tags : [...existing.tags, ...missingTags] }), owner, existing.revision);
    }
    this.lastSignature = signature;
  }
}
