import type { AuthDatabase } from "../db/client";
import type { UserReader } from "./ports/user-repository";
import type { User } from "./user";

function user(row: Record<string, unknown>): User { return { id: String(row.id), email: row.email as string | null, phone: row.phone as string | null, name: String(row.name), passwordHash: row.password_hash as string | null, status: row.status as User["status"], observesUserId: row.observes_user_id as string | null, createdAt: row.created_at as Date, updatedAt: row.updated_at as Date }; }

export class PostgresUserRepository implements UserReader {
  constructor(private readonly db: AuthDatabase) {}

  async findById(id: string) { const r = await this.db.query("SELECT * FROM users WHERE id=$1", [id]); return r.rows[0] ? user(r.rows[0]) : null; }
  async findByEmail(email: string) { const r = await this.db.query("SELECT * FROM users WHERE email=$1", [email]); return r.rows[0] ? user(r.rows[0]) : null; }
}
