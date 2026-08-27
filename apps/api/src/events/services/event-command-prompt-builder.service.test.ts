import { expect, test } from "vitest";
import { EventCommandPromptBuilderService } from "./event-command-prompt-builder.service";

test("describes every field of the flat command contract", () => {
  const prompt = new EventCommandPromptBuilderService().build("dormi sete horas");

  expect(prompt).toContain("sleepHours");
  expect(prompt).toContain("workoutKind");
  expect(prompt).toContain("foodInputText");
  expect(prompt).toContain("routineName");
  expect(prompt).toContain("Frase do usuario: dormi sete horas");
});

test("anchors routine as the default classification", () => {
  const prompt = new EventCommandPromptBuilderService().build("fui na padaria");

  expect(prompt).toContain("'routine' e o padrao");
  expect(prompt).toContain("horas dormidas em formato decimal");
});

test("asks for a relative window instead of dates the model cannot know", () => {
  const prompt = new EventCommandPromptBuilderService().build("vou dormir agora");

  expect(prompt).toContain("Voce nao sabe que horas sao");
  expect(prompt).toContain("durationMinutes");
  expect(prompt).toContain("endTimeOfDay");
  expect(prompt).toContain("startOffsetMinutes");
  // Exemplo que cobre o caso de dormir agora e acordar de manha.
  expect(prompt).toContain('"endTimeOfDay":"06:00"');
});
