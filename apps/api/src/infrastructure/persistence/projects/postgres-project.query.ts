import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { ProjectRef } from "../../../domain";
import type { ProjectQuery } from "../../../domain/ports";
import * as schema from "../database/schema";
import type { Db } from "../shared/tx";
import { ensurePersonalProject } from "./resolve-project";

type ProjectRow = typeof schema.projects.$inferSelect;

export function toProjectRef(row: Pick<ProjectRow, "id" | "name" | "personal">): ProjectRef {
  return { id: row.id, name: row.name, personal: row.personal };
}

/** Os projetos pelos ids, por id. */
export async function projectsByIds(db: Db, ids: readonly string[]): Promise<Map<string, ProjectRef>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(schema.projects).where(inArray(schema.projects.id, [...ids]));
  return new Map(rows.map((row) => [row.id, toProjectRef(row)]));
}

export class PostgresProjectQuery implements ProjectQuery {
  constructor(private readonly db: Db) {}

  async list(userId: string): Promise<ProjectRef[]> {
    await this.db.transaction((tx) => ensurePersonalProject(tx, userId));
    const rows = await this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.personal), sql`lower(${schema.projects.name})`, asc(schema.projects.id));
    return rows.map(toProjectRef);
  }

  async ofTasks(taskIds: readonly string[]): Promise<Map<string, ProjectRef>> {
    if (taskIds.length === 0) return new Map();
    const rows = await this.db
      .select({ taskId: schema.tasks.id, id: schema.projects.id, name: schema.projects.name, personal: schema.projects.personal })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(inArray(schema.tasks.id, [...taskIds]));
    return new Map(rows.map((row) => [row.taskId, toProjectRef(row)]));
  }
}
