import { expect, test } from "vitest";
import type { ArtifactDto } from "@repo/contracts";
import { artifactFixture } from "@/test/fake-api/artifacts";
import { noteMarkdownOf, whenLabel } from "./notes-model";

/** Segunda, 14 de setembro de 2026, 10:00 no fuso da timeline. */
const now = new Date("2026-09-14T10:00:00-03:00");

function text(name: string, body: string, type: "text" | "router" = "text"): ArtifactDto {
  return artifactFixture({ id: "art-1", name, type, data: { body } }) as unknown as ArtifactDto;
}

test("rotula quando o alvo acontece", () => {
  expect(whenLabel("2026-09-14T09:00:00-03:00", now)).toBe("hoje, 09:00");
  expect(whenLabel("2026-09-13T09:00:00-03:00", now)).toBe("ontem, 09:00");
  expect(whenLabel("2026-09-15T08:00:00-03:00", now)).toBe("amanhã, 08:00");
  expect(whenLabel("2026-09-02T09:00:00-03:00", now)).toBe("2 set., 09:00");
});

test("o corpo em markdown fica sem o título repetido e só existe para nota de texto", () => {
  expect(noteMarkdownOf(text("Ideias", "# Ideias\n\nTexto **forte**"))).toBe("Texto **forte**");
  expect(noteMarkdownOf(text("Outro", "Primeira\nSegunda"))).toBe("Primeira\nSegunda");
  expect(noteMarkdownOf(text("JEV · Despacho", "# JEV · Despacho\n\nParâmetros do despacho.", "router"))).toBe("Parâmetros do despacho.");
});
