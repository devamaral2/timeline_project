import type { AuthDatabase } from "./client";
import { RequiredDependencyUnavailableError } from "../common/errors";
export async function checkReadiness(db: AuthDatabase, expectedVersion: number): Promise<void> {
  try {
    await db.query("SELECT 1");
    const result = await db.query("SELECT version FROM auth_schema_meta WHERE singleton = true");
    if (result.rows[0]?.version !== expectedVersion) throw new Error("schema version is not ready");
  } catch (cause) { throw new RequiredDependencyUnavailableError("database unavailable", { cause }); }
}
