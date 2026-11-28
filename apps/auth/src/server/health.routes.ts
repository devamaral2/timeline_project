import type { AuthDatabase } from "../db/client";
import { AUTH_SCHEMA_VERSION, checkReadiness } from "../db/readiness";
import type { AuthRoute } from "./routes";

export interface HealthRouteDependencies {
  readonly database: Pick<AuthDatabase, "query">;
}

/** Liveness não toca o banco; readiness confirma banco, schema e chave ativa. */
export function healthRoutes(deps: HealthRouteDependencies): AuthRoute[] {
  return [
    {
      method: "GET",
      path: "/health/live",
      handler: async () => ({ status: "ok" }),
    },
    {
      method: "GET",
      path: "/health/ready",
      handler: async () => {
        await checkReadiness(deps.database, AUTH_SCHEMA_VERSION);
        return { status: "ok" };
      },
    },
  ];
}
