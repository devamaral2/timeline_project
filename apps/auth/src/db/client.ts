import { Pool, type PoolClient, type PoolConfig } from "pg";

export interface AuthTransaction {
  query: PoolClient["query"];
}
export interface AuthDatabase {
  query: Pool["query"];
  transaction<T>(work: (tx: AuthTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function createAuthDatabase(config: PoolConfig): AuthDatabase {
  const pool = new Pool(config);
  return {
    query: pool.query.bind(pool),
    async transaction<T>(work: (tx: AuthTransaction) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}
