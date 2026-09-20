import type { User } from "../../../domain/users/user";

/** Read-only lookup shared by login, session checks and authorization. */
export interface UserReader {
  findById(id: string): Promise<User | null>;
  findByEmail(normalizedEmail: string): Promise<User | null>;
}
