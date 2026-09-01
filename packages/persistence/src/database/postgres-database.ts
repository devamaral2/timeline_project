import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { OnApplicationShutdown } from "@nestjs/common";

export class PostgresDatabase implements OnApplicationShutdown {
  readonly db: NodePgDatabase;

  constructor(readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  static connect(connectionString: string): PostgresDatabase {
    return new PostgresDatabase(new Pool({ connectionString }));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
