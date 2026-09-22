import { expect, test, vi } from "vitest";
import { PostgresDatabase } from "./postgres-database";

test("shuts down the pool exactly once", async () => {
  const end = vi.fn().mockResolvedValue(undefined);
  const pool = { end } as unknown as ConstructorParameters<typeof PostgresDatabase>[0];
  const database = new PostgresDatabase(pool);

  await database.onApplicationShutdown();

  expect(end).toHaveBeenCalledTimes(1);
});
