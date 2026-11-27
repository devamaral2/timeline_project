import { expect, test } from "vitest";
import { ARTIFACT_TYPE_ORDER, artifactActor, artifactTypeLabel, artifactTypesIn } from "./artifact-model";

test("skill, agente e roteador são notas de agentes; as demais são da pessoa", () => {
  expect((["skill", "agent", "router"] as const).map(artifactActor)).toEqual(["agent", "agent", "agent"]);
  expect((["text", "food", "sleep", "training", "workout"] as const).map(artifactActor)).toEqual(["human", "human", "human", "human", "human"]);
});

test("notícias, resumo de e-mail e transcrição são da pessoa, ainda que o agente os crie", () => {
  expect((["news", "email_summary", "youtube_transcript"] as const).map(artifactActor)).toEqual(["human", "human", "human"]);
});

test("na ordem dos tipos, os de texto livre vêm juntos, logo depois da nota", () => {
  expect(ARTIFACT_TYPE_ORDER.slice(0, 5)).toEqual(["text", "news", "email_summary", "youtube_transcript", "food"]);
  expect(artifactTypesIn([{ type: "sleep" }, { type: "youtube_transcript" }, { type: "text" }, { type: "news" }])).toEqual([
    "text", "news", "youtube_transcript", "sleep",
  ]);
  expect((["news", "email_summary", "youtube_transcript"] as const).map(artifactTypeLabel)).toEqual(["Notícias", "Resumo de e-mail", "Transcrição"]);
});
