import { expect, test } from "vitest";
import { Artifact, ArtifactNotFoundError, ArtifactOwnershipError, ArtifactValidationError, Event } from "../../domain";
import { InMemoryArtifactRepository } from "../../api-core/artifacts/testing/in-memory-artifact.repository";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../../api-core/events/testing/in-memory-event.repository";
import { DeleteArtifactUseCase } from "./delete-artifact.usecase";

const actor = { userId: "auth-user-1" };
const agentFile = { path: "hermes/skills/agenda/SKILL.md", hash: "a".repeat(64), missing: false };

function setup(artifacts: Artifact[], events: Event[] = []) {
  const database = new InMemoryEventDatabase(events, artifacts);
  const useCase = new DeleteArtifactUseCase(new InMemoryArtifactRepository(database.artifacts));
  return { database, useCase, events: new InMemoryEventRepository(database) };
}

test("deletes the artifact of its owner", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "nota" } });
  const { database, useCase } = setup([note]);

  await useCase.execute({ artifactId: "note-1" }, actor);

  expect(database.artifacts).toEqual([]);
});

test("the events it appeared in simply stop showing it, without being revised", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "nota" } });
  const event = Event.create({
    id: "event-1",
    userId: actor.userId,
    name: "Reunião",
    startedAt: new Date("2026-08-17T15:00:00.000Z"),
    artifactLinks: [{ artifactId: "note-1", relation: "creates", fromRecurrence: false }],
  });
  const { useCase, events } = setup([note], [event]);

  await useCase.execute({ artifactId: "note-1" }, actor);

  expect(await events.findById("event-1")).toMatchObject({ artifactLinks: [], revision: 1 });
});

test("refuses an artifact that does not exist or belongs to someone else", async () => {
  const theirs = Artifact.create({ id: "theirs", userId: "someone-else", data: { body: "dele" } });
  const { database, useCase } = setup([theirs]);

  await expect(useCase.execute({ artifactId: "missing" }, actor)).rejects.toThrow(ArtifactNotFoundError);
  await expect(useCase.execute({ artifactId: "theirs" }, actor)).rejects.toThrow(ArtifactOwnershipError);
  expect(database.artifacts).toHaveLength(1);
});

test("a global artifact is nobody's to delete", async () => {
  const global = Artifact.create({ id: "workout", type: "workout", name: "Corrida", data: { code: "running", category: "cardio" } });
  const { database, useCase } = setup([global]);

  await expect(useCase.execute({ artifactId: "workout" }, actor)).rejects.toThrow(ArtifactOwnershipError);
  expect(database.artifacts).toHaveLength(1);
});

test("skill and agent artifacts follow the files and cannot be deleted, even by their owner", async () => {
  const skill = Artifact.create({ id: "skill", userId: actor.userId, type: "skill", name: "Agenda", data: agentFile });
  const agent = Artifact.create({
    id: "agent",
    userId: actor.userId,
    type: "agent",
    name: "Planner",
    data: { ...agentFile, path: "hermes/agents/planner.md" },
  });
  const { database, useCase } = setup([skill, agent]);

  await expect(useCase.execute({ artifactId: "skill" }, actor)).rejects.toThrow(
    "Skill and agent artifacts follow the files and cannot be deleted",
  );
  await expect(useCase.execute({ artifactId: "agent" }, actor)).rejects.toThrow(ArtifactValidationError);
  expect(database.artifacts).toHaveLength(2);
});

test("router artifacts follow the JEV config and cannot be deleted", async () => {
  const router = Artifact.create({ id: "router", userId: actor.userId, type: "router", name: "Rota", data: { body: "passos" } });
  const { database, useCase } = setup([router]);

  await expect(useCase.execute({ artifactId: "router" }, actor)).rejects.toThrow(
    "Router artifacts follow the JEV config and cannot be deleted",
  );
  expect(database.artifacts).toHaveLength(1);
});
