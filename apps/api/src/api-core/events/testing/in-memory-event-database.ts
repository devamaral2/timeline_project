import { Event, EventValidationError, type Artifact } from "../../../domain";
import type { SequenceChange } from "../../../domain/ports";

/**
 * Estado compartilhado entre os repositorios e as consultas em memoria, para
 * que o que e gravado junto (o evento, os artefatos dele, as relacoes) apareca
 * nas leituras, como na transacao unica do Postgres.
 */
export class InMemoryEventDatabase {
  events: Event[];
  /** Mutado no lugar: o `InMemoryArtifactRepository` compartilha esta mesma lista. */
  readonly artifacts: Artifact[];
  /** De qual original saiu cada copia. */
  readonly derivations: { originalId: string; copyId: string }[] = [];
  /** A sequencia entre eventos: `fromId` vem antes de `toId`. */
  edges: { fromId: string; toId: string }[] = [];

  constructor(events: Event[] = [], artifacts: Artifact[] = []) {
    this.events = [...events];
    this.artifacts = [...artifacts];
  }

  /** Aplica as arestas como o escritor do Postgres: as pontas existem e sao do usuario, e a ordem nao fecha ciclo. */
  apply(userId: string, changes: readonly SequenceChange[]): void {
    for (const change of changes) {
      if (change.op === "remove") {
        this.edges = this.edges.filter((edge) => edge.fromId !== change.fromId || edge.toId !== change.toId);
        continue;
      }
      for (const id of [change.fromId, change.toId]) {
        const found = this.events.find((event) => event.id === id && event.userId === userId);
        if (!found) throw new EventValidationError(`Related events not found: ${id}`);
      }
      if (!this.edges.some((edge) => edge.fromId === change.fromId && edge.toId === change.toId)) {
        this.edges.push({ fromId: change.fromId, toId: change.toId });
      }
      if (this.reaches(change.toId, change.fromId)) {
        throw new EventValidationError("Events cannot follow each other in a cycle");
      }
    }
  }

  /** Seguindo a sequencia a partir de `fromId`, chega-se em `targetId`. */
  private reaches(fromId: string, targetId: string): boolean {
    const seen = new Set<string>();
    const queue = [fromId];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      if (id === targetId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of this.edges) if (edge.fromId === id) queue.push(edge.toId);
    }
    return false;
  }

  /** O evento como o repositorio o devolve: com a sequencia lida das arestas, sem as pontas apagadas. */
  hydrate(event: Event): Event {
    const live = (id: string) => this.events.some((other) => other.id === id);
    return Event.rehydrate({
      id: event.id,
      userId: event.userId,
      actor: event.actor,
      kind: event.kind,
      status: event.status,
      priority: event.priority,
      name: event.name,
      description: event.description,
      location: event.location,
      startedAt: event.startedAt,
      estimatedFinishAt: event.estimatedFinishAt,
      finishedAt: event.finishedAt,
      notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
      tags: [...event.tags],
      longRunning: event.longRunning,
      data: { ...event.data },
      artifactLinks: event.artifactLinks.filter((link) => this.artifacts.some((artifact) => artifact.id === link.artifactId)),
      previousIds: this.edges.filter((edge) => edge.toId === event.id && live(edge.fromId)).map((edge) => edge.fromId),
      nextIds: this.edges.filter((edge) => edge.fromId === event.id && live(edge.toId)).map((edge) => edge.toId),
      occurrence: event.occurrence,
      revision: event.revision,
    });
  }

  /** Os artefatos vivos de um evento, na ordem das relacoes. */
  artifactsOf(event: Event): Artifact[] {
    return event.artifactLinks.flatMap((link) => {
      const artifact = this.artifacts.find((candidate) => candidate.id === link.artifactId);
      return artifact ? [artifact] : [];
    });
  }

  writeArtifacts(
    writes:
      | {
          created?: readonly Artifact[];
          updated?: readonly { artifact: Artifact }[];
          derivations?: readonly { originalId: string; copyId: string }[];
        }
      | undefined,
  ): void {
    for (const artifact of writes?.created ?? []) this.artifacts.push(artifact);
    for (const { artifact } of writes?.updated ?? []) {
      const index = this.artifacts.findIndex((stored) => stored.id === artifact.id);
      if (index !== -1) this.artifacts[index] = artifact;
    }
    this.derivations.push(...(writes?.derivations ?? []));
  }
}
