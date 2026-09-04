import type { User } from "../user";
export interface UserRepository { findById(id: string): Promise<User | null>; findByEmail(normalizedEmail: string): Promise<User | null>; }

/** A metade de leitura da porta. Quem so precisa achar um usuario depende
 *  disto, e nao da porta inteira: um usecase de login nao tem por que enxergar
 *  as escritas administrativas. */
export type UserReader = Pick<UserRepository, "findById" | "findByEmail">;
