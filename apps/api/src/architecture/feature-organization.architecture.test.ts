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

  for (const name of [
    "create-task",
    "get-task",
    "update-task",
    "delete-task",
    "list-agenda-tasks",
    "list-tracked-tasks",
    "suggest-tags",
    "search-places",
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
  ]) {
    expect(folders, name).toContain(name);
    expect(filesUnder(join(features, name)).some((path) => path.endsWith(".controller.ts")), name).toBe(true);
  }
});

test("each Nest controller source declares one public route operation", () => {
  const controllers = filesUnder(features).filter((path) => path.endsWith(".controller.ts"));
  expect(controllers.length).toBeGreaterThan(0);
  for (const path of controllers) {
    const source = readFileSync(path, "utf8");
    const routeDecorators = source.match(/@(Get|Post|Patch|Delete)\s*(?:\([^)]*\))?/g) ?? [];
    expect(routeDecorators, path).toHaveLength(1);
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
