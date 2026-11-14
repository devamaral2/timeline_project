import { Event, type Artifact } from "../../../domain";

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

  constructor(events: Event[] = [], artifacts: Artifact[] = []) {
    this.events = [...events];
    this.artifacts = [...artifacts];
  }

  /** O evento como o repositorio o devolve: com as relacoes que chegam nele, lidas dos eventos de origem. */
  hydrate(event: Event): Event {
    const origins = (pick: (origin: Event) => readonly string[]) =>
      this.events.filter((origin) => pick(origin).includes(event.id)).map((origin) => origin.id);
    return Event.rehydrate({
      id: event.id,
      userId: event.userId,
      actor: event.actor,
      kind: event.kind,
      status: event.status,
      priority: event.priority,
      name: event.name,
      description: event.description,
      startedAt: event.startedAt,
      estimatedFinishAt: event.estimatedFinishAt,
      finishedAt: event.finishedAt,
      notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
      tags: [...event.tags],
      longRunning: event.longRunning,
      data: { ...event.data },
      artifactLinks: event.artifactLinks.filter((link) => this.artifacts.some((artifact) => artifact.id === link.artifactId)),
      subtaskIds: event.subtaskIds.filter((id) => this.events.some((other) => other.id === id)),
      blocksIds: event.blocksIds.filter((id) => this.events.some((other) => other.id === id)),
      parentIds: origins((origin) => origin.subtaskIds),
      blockedByIds: origins((origin) => origin.blocksIds),
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
