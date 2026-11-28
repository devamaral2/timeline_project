import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export class PostgresDatabase {
  readonly db: NodePgDatabase<typeof schema>;

  constructor(readonly pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  static connect(connectionString: string): PostgresDatabase {
    return new PostgresDatabase(new Pool({ connectionString }));
  }

  /** Encerra o pool. O lifecycle do processo chama no shutdown, depois de parar de aceitar trabalho. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
