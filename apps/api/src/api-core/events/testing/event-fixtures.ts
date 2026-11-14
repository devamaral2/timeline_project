import { Artifact, DEFAULT_EVENT_KIND, Event, type EventCreateProps, type EventKind } from "../../../domain";
import { InMemoryEventDatabase } from "./in-memory-event-database";

export interface ArtifactFixture {
  type: string;
  data: unknown;
  id?: string;
  name?: string;
}

export interface EventFixture {
  event: Event;
  artifacts: Artifact[];
}

const KIND_BY_ARTIFACT_TYPE: Readonly<Record<string, EventKind>> = { food: "meal", sleep: "sleep", training: "training" };

/**
 * Um evento de teste com os artefatos dele, ja ligados na ordem dada. Sem
 * `kind`, a natureza do evento e a do primeiro artefato de alimento, sono ou treino.
 */
export function eventWith(
  props: Omit<EventCreateProps, "artifactLinks" | "kind"> & { kind?: EventKind },
  artifacts: readonly ArtifactFixture[] = [],
): EventFixture {
  const created = artifacts.map((fixture) =>
    Artifact.create({ userId: props.userId, id: fixture.id, name: fixture.name, type: fixture.type, data: fixture.data }),
  );
  const inferred = created.map((artifact) => KIND_BY_ARTIFACT_TYPE[artifact.type]).find(Boolean);
  const event = Event.create({
    ...props,
    kind: props.kind ?? inferred ?? DEFAULT_EVENT_KIND,
    artifactLinks: created.map((artifact) => ({ artifactId: artifact.id, relation: "creates" as const, fromRecurrence: false })),
  });
  return { event, artifacts: created };
}

export function databaseOf(fixtures: readonly EventFixture[]): InMemoryEventDatabase {
  return new InMemoryEventDatabase(
    fixtures.map((fixture) => fixture.event),
    fixtures.flatMap((fixture) => fixture.artifacts),
  );
}
