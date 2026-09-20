import type { AuthDatabase } from "../../db/client";
import type { UserReader } from "./ports/user-repository";
import type { User } from "../../domain/users/user";

function user(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: row.password_hash as string | null,
    status: row.status as User["status"],
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export class PostgresUserRepository implements UserReader {
  constructor(private readonly db: AuthDatabase) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query("SELECT * FROM users WHERE id=$1", [id]);
    return result.rows[0] ? user(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query("SELECT * FROM users WHERE email=$1", [email]);
    return result.rows[0] ? user(result.rows[0]) : null;
  }
}
