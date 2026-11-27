import { expect, test } from "vitest";
import type { TaskCardDto } from "@repo/contracts";
import { taskFixture } from "@/test/fake-api/tasks";
import { drawerGrows, EXECUTION_STATUS_FILTER, executionRunsOf, shownRowCount } from "./execution-runs";

const card = (overrides: Partial<TaskCardDto> & { id: string }) => taskFixture({ actor: "agent", kind: "request", status: "running", ...overrides }) as TaskCardDto;

test("o filtro de status é o grupo em andamento dos contratos", () => {
  expect([...EXECUTION_STATUS_FILTER].sort()).toEqual(["awaiting_transcription", "preparing", "queued", "running", "starting"]);
});

test("só execução de agente em andamento, sem passo nem execução agendada, da mais recente para a mais antiga", () => {
  const runs = executionRunsOf([
    card({ id: "velha", startedAt: "2026-09-14T08:00:00-03:00" }),
    card({ id: "nova", status: "queued", startedAt: "2026-09-14T09:30:00-03:00" }),
    card({ id: "passo", kind: "step", startedAt: "2026-09-14T09:40:00-03:00" }),
    card({ id: "agendada", kind: "cron", startedAt: "2026-09-14T09:41:00-03:00" }),
    card({ id: "feita", status: "completed", startedAt: "2026-09-14T09:42:00-03:00" }),
    card({ id: "espera", status: "waiting", startedAt: "2026-09-14T09:43:00-03:00" }),
    taskFixture({ id: "pessoa", status: "doing", startedAt: "2026-09-14T09:44:00-03:00" }) as TaskCardDto,
  ]);
  expect(runs.map((run) => run.id)).toEqual(["nova", "velha"]);
});

test("o conteúdo guardado esperando a transcrição ou rodando aparece na gaveta; o terminado não", () => {
  const runs = executionRunsOf([
    card({ id: "video", kind: "save_content_with_transcription", status: "awaiting_transcription", startedAt: "2026-09-14T09:10:00-03:00" }),
    card({ id: "pagina", kind: "save_content", status: "running", startedAt: "2026-09-14T09:05:00-03:00" }),
    card({ id: "guardada", kind: "save_content", status: "completed", startedAt: "2026-09-14T09:20:00-03:00" }),
  ]);
  expect(runs.map((run) => run.id)).toEqual(["video", "pagina"]);
});

test("sem início a execução vai para o fim e o empate se desfaz pelo id", () => {
  const same = "2026-09-14T09:00:00-03:00";
  const runs = executionRunsOf([card({ id: "a", startedAt: same }), card({ id: "b", startedAt: same }), card({ id: "sem" })]);
  expect(runs.map((run) => run.id)).toEqual(["b", "a", "sem"]);
});

test("cada altura mostra uma, até três ou todas as linhas", () => {
  expect([shownRowCount("one", 5), shownRowCount("three", 5), shownRowCount("all", 5)]).toEqual([1, 3, 5]);
  expect([shownRowCount("one", 0), shownRowCount("three", 2), shownRowCount("all", 2)]).toEqual([0, 2, 2]);
});

test("a gaveta cresce de uma para três e de três para todas, e encolhe no caminho inverso", () => {
  expect(drawerGrows("one", "three")).toBe(true);
  expect(drawerGrows("three", "all")).toBe(true);
  expect(drawerGrows("all", "three")).toBe(false);
  expect(drawerGrows("three", "one")).toBe(false);
  expect(drawerGrows("three", "three")).toBe(false);
});
