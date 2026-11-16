import { Artifact, DEFAULT_TASK_KIND, Task, type TaskCreateProps, type TaskKind } from "../../../domain/index";
import { InMemoryTaskDatabase } from "./in-memory-task-database";

export interface ArtifactFixture {
  type: string;
  data: unknown;
  id?: string;
  name?: string;
}

export interface TaskFixture {
  task: Task;
  artifacts: Artifact[];
}

const KIND_BY_ARTIFACT_TYPE: Readonly<Record<string, TaskKind>> = { food: "meal", sleep: "sleep", training: "training" };

/**
 * Uma tarefa de teste com os artefatos dela, ja ligados na ordem dada. Sem
 * `kind`, a natureza da tarefa e a do primeiro artefato de alimento, sono ou treino.
 */
export function taskWith(
  props: Omit<TaskCreateProps, "artifactLinks" | "kind"> & { kind?: TaskKind },
  artifacts: readonly ArtifactFixture[] = [],
): TaskFixture {
  const created = artifacts.map((fixture) =>
    Artifact.create({ userId: props.userId, id: fixture.id, name: fixture.name, type: fixture.type, data: fixture.data }),
  );
  const inferred = created.map((artifact) => KIND_BY_ARTIFACT_TYPE[artifact.type]).find(Boolean);
  const task = Task.create({
    ...props,
    kind: props.kind ?? inferred ?? DEFAULT_TASK_KIND,
    artifactLinks: created.map((artifact) => ({ artifactId: artifact.id, relation: "creates" as const, fromRecurrence: false })),
  });
  return { task, artifacts: created };
}

export function databaseOf(fixtures: readonly TaskFixture[]): InMemoryTaskDatabase {
  return new InMemoryTaskDatabase(
    fixtures.map((fixture) => fixture.task),
    fixtures.flatMap((fixture) => fixture.artifacts),
  );
}
