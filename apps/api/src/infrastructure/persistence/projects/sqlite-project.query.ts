import type { ProjectRef } from "../../../domain";
import type { ProjectQuery } from "../../../domain/ports";
import { projects, type ProjectRow } from "../database/tables";
import { c, rowDecoder, sql } from "@repo/sqlite";
import type { Db } from "../shared/tx";
import { ensurePersonalProject } from "./resolve-project";

export function toProjectRef(row: Pick<ProjectRow, "id" | "name" | "personal">): ProjectRef {
  return { id: row.id, name: row.name, personal: row.personal };
}

/** Os projetos pelos ids, por id. */
export async function projectsByIds(db: Pick<Db, "all">, ids: readonly string[]): Promise<Map<string, ProjectRef>> {
  if (ids.length === 0) return new Map();
  const rows = await db.all(sql`SELECT ${projects.select()} FROM projects WHERE id IN ${sql.in(ids)}`, projects);
  return new Map(rows.map((row) => [row.id, toProjectRef(row)]));
}

const projectOfTaskRow = rowDecoder({ taskId: c.text, id: c.text, name: c.text, personal: c.boolean });

export class SqliteProjectQuery implements ProjectQuery {
  constructor(private readonly db: Db) {}

  async list(userId: string): Promise<ProjectRef[]> {
    await this.db.transaction((tx) => ensurePersonalProject(tx, userId));
    const rows = await this.db.all(
      sql`SELECT ${projects.select()} FROM projects WHERE user_id = ${userId}
          ORDER BY personal DESC, lower(name), id`,
      projects,
    );
    return rows.map(toProjectRef);
  }

  async ofTasks(taskIds: readonly string[]): Promise<Map<string, ProjectRef>> {
    if (taskIds.length === 0) return new Map();
    const rows = await this.db.all(
      sql`SELECT t.id AS "taskId", p.id AS "id", p.name AS "name", p.personal AS "personal"
          FROM tasks t JOIN projects p ON p.id = t.project_id
          WHERE t.id IN ${sql.in(taskIds)}`,
      projectOfTaskRow,
    );
    return new Map(rows.map((row) => [row.taskId, toProjectRef(row)]));
  }
}
