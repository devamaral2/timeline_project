import { describe, expect, it } from "vitest";
import type { SpeakerTurn, TimedText } from "../types";
import { matchSpeakers } from "./speakers";

const text = (startSeconds: number, endSeconds: number, value: string): TimedText => ({ startSeconds, endSeconds, text: value });
const turn = (startSeconds: number, endSeconds: number, speaker: string): SpeakerTurn => ({ startSeconds, endSeconds, speaker });

describe("casar falas com falantes pelo tempo", () => {
  it("dá a cada fala o falante que mais a cobre e rotula na ordem em que cada voz aparece", () => {
    const turns = [turn(0, 10, "SPEAKER_01"), turn(10, 20, "SPEAKER_00")];
    const result = matchSpeakers([text(1, 5, "oi"), text(11, 15, "olá")], turns);
    expect(result.map((segment) => segment.speaker)).toEqual(["Falante 1", "Falante 2"]);
  });

  it("escolhe o falante de maior sobreposição quando a fala atravessa dois turnos", () => {
    const turns = [turn(0, 6, "A"), turn(6, 20, "B")];
    expect(matchSpeakers([text(0, 2, "a"), text(4, 12, "x")], turns)[1]?.speaker).toBe("Falante 2");
  });

  it("soma os turnos separados do mesmo falante", () => {
    const turns = [turn(0, 3, "A"), turn(3, 5, "B"), turn(5, 8, "A")];
    expect(matchSpeakers([text(0, 8, "x")], turns)[0]?.speaker).toBe("Falante 1");
  });

  it("usa o turno mais próximo quando a fala cai num silêncio entre turnos", () => {
    const turns = [turn(0, 10, "A"), turn(20, 30, "B")];
    expect(matchSpeakers([text(1, 2, "a"), text(17, 18, "x")], turns)[1]?.speaker).toBe("Falante 2");
  });

  it("sem nenhum turno, tudo é do Falante 1", () => {
    const result = matchSpeakers([text(0, 1, "a"), text(1, 2, "b")], []);
    expect(result.map((segment) => segment.speaker)).toEqual(["Falante 1", "Falante 1"]);
  });

  it("mantém o texto e o tempo de cada fala e descarta as vazias", () => {
    const result = matchSpeakers([text(0, 2, "  uma fala  "), text(2, 3, "   ")], [turn(0, 3, "A")]);
    expect(result).toEqual([{ startSeconds: 0, endSeconds: 2, speaker: "Falante 1", text: "uma fala" }]);
  });
});
