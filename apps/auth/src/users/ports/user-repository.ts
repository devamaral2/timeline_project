import type { User } from "../user";
export interface UserRepository { findById(id: string): Promise<User | null>; findByEmail(normalizedEmail: string): Promise<User | null>; }
