import { expect, test } from "vitest";
import type { EventDto } from "@repo/contracts";
import { createFakeApi } from ".";
import { artifactFixture, artifactsArea } from "./artifacts";
import { eventFixture, eventsArea } from "./events";

const WORKOUT = { code: "weightlifting", category: "strength", active: true };

test("GET do evento monta artifacts com os vínculos dele, na ordem em que foram semeados", async () => {
  const api = createFakeApi({
    areas: [eventsArea, artifactsArea],
    seed: {
      events: [eventFixture({ id: "ev-1" }), eventFixture({ id: "ev-2" })],
      artifacts: [
        artifactFixture({ id: "art-global", name: "Musculação", type: "workout", global: true, data: WORKOUT, links: [{ eventId: "ev-1", relation: "uses" }] }),
        artifactFixture({ id: "art-own", name: "Ficha A", links: [{ eventId: "ev-1", relation: "uses" }] }),
        artifactFixture({ id: "art-other", name: "De outro evento", links: [{ eventId: "ev-2", relation: "uses" }] }),
        artifactFixture({ id: "art-created", name: "Registro", links: [{ eventId: "ev-1", relation: "creates" }] }),
        artifactFixture({ id: "art-gone", name: "Apagado", deleted: true, links: [{ eventId: "ev-1", relation: "uses" }] }),
      ],
    },
  });

  const event = (await api.authedFetch("/api/events/ev-1")) as EventDto;

  expect(event.artifacts.map((link) => [link.artifact.name, link.relation])).toEqual([
    ["Musculação", "uses"],
    ["Ficha A", "uses"],
    ["Registro", "creates"],
  ]);
  expect(event.artifacts[0]?.artifact).toMatchObject({ id: "art-global", type: "workout", global: true });
  // O artefato vem inteiro, mas sem `events`: essa lista só existe nas listas de artefatos.
  expect(event.artifacts[1]?.artifact).not.toHaveProperty("events");
  expect(event.artifacts[1]?.fromRecurrence).toBe(false);
});

test("um evento sem vínculo de artefato devolve artifacts vazio", async () => {
  const api = createFakeApi({
    areas: [eventsArea, artifactsArea],
    seed: {
      events: [eventFixture({ id: "ev-1" })],
      artifacts: [artifactFixture({ id: "art-other", links: [{ eventId: "ev-2", relation: "uses" }] })],
    },
  });

  const event = (await api.authedFetch("/api/events/ev-1")) as EventDto;

  expect(event.artifacts).toEqual([]);
});
