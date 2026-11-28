import { ulid } from "ulid";
import { ProjectNameTakenError, type ProjectRef } from "../../../domain";
import type { ProjectRepository } from "../../../domain/ports";
import { projects } from "../database/tables";
import { sql } from "../sqlite/sql";
import type { Db } from "../shared/tx";
import { ensurePersonalProject } from "./resolve-project";

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db) {}

  async create(userId: string, name: string): Promise<ProjectRef> {
    return this.db.transaction(async (tx) => {
      // O `diario` nasce antes: o nome dele tambem esta tomado, e criar "Diario" antes de ele existir faria a
      // primeira tarefa sem projeto bater no indice unico.
      await ensurePersonalProject(tx, userId);

      const taken = await tx.get(sql`SELECT id FROM projects WHERE user_id = ${userId} AND lower(name) = lower(${name})`);
      if (taken) throw new ProjectNameTakenError(`Project already exists: ${name}`);

      const id = ulid();
      await tx.execute(projects.insert({ id, userId, name, personal: false }));
      return { id, name, personal: false };
    });
  }
}
