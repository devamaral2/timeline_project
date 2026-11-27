import { and, eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { ProjectNameTakenError, type ProjectRef } from "../../../domain";
import type { ProjectRepository } from "../../../domain/ports";
import * as schema from "../database/schema";
import { lockUser, type Db } from "../shared/tx";
import { ensurePersonalProject } from "./resolve-project";

export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db) {}

  async create(userId: string, name: string): Promise<ProjectRef> {
    return this.db.transaction(async (tx) => {
      // A trava por usuario serializa duas criacoes do mesmo nome. O `personal` nasce antes: o nome dele tambem
      // esta tomado, e criar "Personal" antes de ele existir faria a primeira tarefa sem projeto bater no indice unico.
      await lockUser(tx, userId);
      await ensurePersonalProject(tx, userId);

      const [taken] = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.userId, userId), sql`lower(${schema.projects.name}) = lower(${name})`));
      if (taken) throw new ProjectNameTakenError(`Project already exists: ${name}`);

      const id = ulid();
      await tx.insert(schema.projects).values({ id, userId, name, personal: false });
      return { id, name, personal: false };
    });
  }
}
