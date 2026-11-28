import type { ArtifactDto } from "@repo/contracts";
import { describe, expect, test } from "vitest";
import { artifactDrawersOf, artifactDrawerStartsOpen, artifactRowFacts, MISSING_AGENT_FILE_LINE } from "./artifact-drawers";

/** 14 de setembro de 2026, 12:00 em São Paulo. */
const NOW = new Date("2026-09-14T15:00:00.000Z");

function artifact(type: string, data: unknown, extra: Partial<ArtifactDto> = {}): ArtifactDto {
  return {
    id: `art-${type}`,
    name: type,
    type,
    data,
    schemaVersion: 1,
    global: false,
    derived: false,
    tags: ["casa"],
    revision: 1,
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-14T12:12:00.000Z",
    ...extra,
  } as ArtifactDto;
}

const totals = (kcal: number) => ({ totalCaloriesKcal: kcal, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 });
const food = (kcal: number, generation?: "pending" | "completed" | "failed") =>
  artifact("food", { description: "Prato", items: [], totals: totals(kcal), ...(generation ? { generation: { status: generation } } : {}) });

describe("gavetas", () => {
  test("uma por tipo presente, na ordem dos tipos, mantendo a ordem recebida dentro dela", () => {
    const drawers = artifactDrawersOf([
      artifact("router", { body: "" }),
      artifact("text", { body: "" }, { id: "nova" }),
      artifact("youtube_transcript", { body: "" }),
      artifact("text", { body: "" }, { id: "antiga" }),
      artifact("email_summary", { body: "" }),
      artifact("news", { body: "" }),
    ]);

    expect(drawers.map((drawer) => drawer.title)).toEqual(["Notas", "Notícias", "Resumos de e-mail", "Transcrições", "Roteadores"]);
    expect(drawers[0]?.artifacts.map((item) => item.id)).toEqual(["nova", "antiga"]);
  });

  test("o tipo desconhecido vai para Outros, no fim, em vez de sumir", () => {
    const drawers = artifactDrawersOf([artifact("hologram", { frames: 3 }), artifact("agent", { path: "a.md", hash: "x", missing: false })]);
    expect(drawers.map((drawer) => [drawer.key, drawer.title])).toEqual([["agent", "Agentes"], ["other", "Outros"]]);
  });

  test("sem artefato não há gaveta", () => {
    expect(artifactDrawersOf([])).toEqual([]);
  });

  test("na lista inteira só Notas abre; com filtro ou gaveta sozinha, abre", () => {
    expect(artifactDrawerStartsOpen("text", 3, false)).toBe(true);
    expect(artifactDrawerStartsOpen("skill", 3, false)).toBe(false);
    expect(artifactDrawerStartsOpen("skill", 3, true)).toBe(true);
    expect(artifactDrawerStartsOpen("skill", 1, false)).toBe(true);
  });
});

describe("linha", () => {
  test("texto livre: quando mudou e as tags", () => {
    expect(artifactRowFacts(artifact("news", { body: "" }), NOW)).toEqual({ support: [{ text: "Hoje, 09:12" }], tags: ["casa"], figure: null, agentStatus: null });
  });

  test("refeição: calorias na ponta; calculando ou com falha, o status do agente", () => {
    expect(artifactRowFacts(food(1240.4, "completed"), NOW)).toMatchObject({ figure: "1.240 kcal", agentStatus: null });
    expect(artifactRowFacts(food(0), NOW)).toMatchObject({ figure: null, agentStatus: null });
    expect(artifactRowFacts(food(0, "pending"), NOW)).toMatchObject({ figure: null, agentStatus: "running" });
    expect(artifactRowFacts(food(0, "failed"), NOW)).toMatchObject({ figure: null, agentStatus: "failed" });
  });

  test("sono: duração e pontuação no lugar da data", () => {
    expect(artifactRowFacts(artifact("sleep", { trackedSleepTime: 460, score: 82 }), NOW).support).toEqual([{ text: "7 h 40", style: "mono" }, { text: "Pontuação 82" }]);
    expect(artifactRowFacts(artifact("sleep", { trackedSleepTime: 0, score: 0 }), NOW).support).toEqual([{ text: "Pontuação 0" }]);
  });

  test("treino: nomes dos exercícios sem repetir e a duração somada na ponta", () => {
    const workout = (workoutName: string, duration: number) => ({ id: workoutName, workoutCode: "free", workoutName, calories: 0, duration });
    const facts = artifactRowFacts(artifact("training", { caloriesBurned: 0, workouts: [workout("Corrida", 30), workout("Livre", 15), workout("Corrida", 15)] }), NOW);
    expect(facts).toMatchObject({ support: [{ text: "Hoje, 09:12" }, { text: "Corrida, Livre", style: "fill" }], figure: "1 h" });
  });

  test("exercício: só o código da categoria", () => {
    expect(artifactRowFacts(artifact("workout", { code: "running", category: "cardio", active: true }), NOW)).toEqual({
      support: [{ text: "cardio", style: "mono" }], tags: [], figure: null, agentStatus: null,
    });
  });

  test("skill e agente: a descrição do arquivo, o aviso de arquivo sumido ou, sem os dois, quando mudou", () => {
    const file = (extra: Record<string, unknown>) => artifact("skill", { path: "s/SKILL.md", hash: "x", missing: false, ...extra });
    expect(artifactRowFacts(file({ description: " Revisa. " }), NOW)).toMatchObject({ support: [{ text: "Revisa.", style: "fill" }], tags: [] });
    expect(artifactRowFacts(file({ description: "Revisa.", missing: true }), NOW).support).toEqual([{ text: MISSING_AGENT_FILE_LINE, style: "alert" }]);
    expect(artifactRowFacts(file({}), NOW).support).toEqual([{ text: "Hoje, 09:12" }]);
  });
});
