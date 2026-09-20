import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { GlobalSetupContext } from "vitest/node";

export default async function setup({ provide }: GlobalSetupContext) {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  provide("apiPostgresUrl", container.getConnectionUri());
  return async () => {
    await container.stop();
  };
}
