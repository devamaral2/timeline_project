import { randomUUID } from "node:crypto";

export function createTestUserForFile(file: string) {
  const suffix = randomUUID();
  const label = file.split(/[\\/]/).pop()?.replace(/[^a-z0-9]/gi, "-").toLowerCase() ?? "test";
  return { id: `test-${suffix}`, email: `${label}-${suffix}@example.test`, name: `Test ${label}` };
}
