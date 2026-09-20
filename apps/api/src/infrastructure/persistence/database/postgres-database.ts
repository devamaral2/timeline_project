import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { OnApplicationShutdown } from "@nestjs/common";
import * as schema from "./schema";

export class PostgresDatabase implements OnApplicationShutdown {
  readonly db: NodePgDatabase<typeof schema>;

  constructor(readonly pool: Pool) {
    this.db = drizzle(pool, { schema });
  }

  static connect(connectionString: string): PostgresDatabase {
    return new PostgresDatabase(new Pool({ connectionString }));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
