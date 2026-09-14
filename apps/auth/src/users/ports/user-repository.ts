import type { User } from "../user";

/** A leitura de usuarios que login e sessao precisam. As escritas moram nos
 *  repositorios dos fluxos que as fazem (signup, guest), dentro das transacoes deles. */
export interface UserReader {
  findById(id: string): Promise<User | null>;
  findByEmail(normalizedEmail: string): Promise<User | null>;
}
