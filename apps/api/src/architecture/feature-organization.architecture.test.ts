import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const src = join(__dirname, "..");
const features = join(src, "features");

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** Cada operacao declara a rota no Fastify, sem controller. */
const MIGRATED = [
  "create-task",
  "get-task",
  "update-task",
  "delete-task",
  "list-agenda-tasks",
  "list-tracked-tasks",
  "set-task-situation",
  "create-project",
  "list-projects",
  "create-artifact",
  "get-artifact",
  "update-artifact",
  "delete-artifact",
  "list-artifacts",
  "create-recurrence",
  "get-recurrence",
  "update-recurrence",
  "delete-recurrence",
  "list-recurrences",
  "start-request",
  "start-edit-request",
  "start-hermes-request",
  "start-model-request",
  "get-model-options",
  "start-voice-request",
  "list-requests",
  "get-request",
  "cancel-request",
  "save-daily-reading",
  "request-transcription",
  "reserve-transcription",
  "renew-transcription-lease",
  "deliver-transcription",
  "list-agent-files",
  "read-agent-file",
  "list-agent-file-backups",
  "restore-agent-file",
  "request-agent-file-edit",
  "suggest-tags",
  "search-places",
];

test("does not retain the old feature aggregators or artificial HTTP areas", () => {
  for (const name of ["tasks", "artifacts", "recurrences", "agent", "request-identity", "notes", "catalog"]) {
    expect(existsSync(join(features, name)), name).toBe(false);
  }
  expect(existsSync(join(src, "http/request-identity"))).toBe(true);
});

test("has one folder per operation on tasks, artifacts and recurrences, and none left for events, notes or interruptions", () => {
  const folders = readdirSync(features, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // Evento (agora tarefa), nota e interrupcao sairam do vocabulario (ADR 0011): o que era delas e de tarefa e de artefato.
  const retired = folders.filter(
    (name) => /-(event|events|note|notes|interruption|interruptions)(-|$)/.test(name),
  );
  expect(retired).toEqual([]);

  for (const name of MIGRATED) {
    expect(folders, name).toContain(name);
  }
  expect(folders.filter((name) => filesUnder(join(features, name)).some((path) => path.endsWith(".controller.ts")))).toEqual([]);
});

test("cada feature declara a sua rota sem Nest e sem Fastify, e nao guarda controller", () => {
  for (const name of MIGRATED) {
    const files = filesUnder(join(features, name));
    const routes = files.filter((path) => path.endsWith(".route.ts"));
    expect(routes, name).toHaveLength(1);
    expect(files.some((path) => path.endsWith(".controller.ts")), name).toBe(false);

    const source = readFileSync(routes[0] as string, "utf8");
    expect(source, routes[0]).not.toMatch(/@nestjs\/|from\s+["']fastify["']/);
  }
});



test("features do not import another feature and transport stays outside features", () => {
  const featureFiles = filesUnder(features).filter((path) => path.endsWith(".ts"));
  for (const path of featureFiles) {
    const source = readFileSync(path, "utf8");
    expect(source, path).not.toMatch(/from\s+["'][^"']*\/features\//);
  }
  for (const path of filesUnder(join(src, "http"))) {
    expect(path).not.toContain(`${join("features", "agent")}`);
  }
});
