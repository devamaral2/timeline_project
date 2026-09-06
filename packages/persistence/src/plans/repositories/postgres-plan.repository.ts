import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ulid } from "ulid";
import { Plan, PlanNotFoundError, PlanOwnershipError, PlanRevisionConflictError } from "@repo/entities";
import type { PlanRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { mapPlanRow } from "../mappers/plan-row.mapper";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

async function insertTags(tx: Tx, plan: Plan): Promise<void> {
  if (plan.tags.length === 0) return;

  const tagIds: string[] = [];
  for (const name of plan.tags) {
    const [row] = await tx
      .insert(schema.tags)
      .values({ id: ulid(), userId: plan.userId, name })
      .onConflictDoUpdate({
        target: [schema.tags.userId, schema.tags.name],
        set: { name: sql`excluded.name` },
      })
      .returning({ id: schema.tags.id });
    tagIds.push(row.id);
  }

  await tx.insert(schema.planTags).values(tagIds.map((tagId) => ({ planId: plan.id, tagId })));
}

export class PostgresPlanRepository implements PlanRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(plan: Plan): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.plans).values({
        id: plan.id,
        revision: plan.revision,
        userId: plan.userId,
        name: plan.name,
        description: plan.description,
        status: plan.status,
        priority: plan.priority,
        startedAt: plan.startedAt ?? null,
        estimatedFinishAt: plan.estimatedFinishAt ?? null,
        finishedAt: plan.finishedAt ?? null,
      });

      await insertTags(tx, plan);
    });
  }

  async update(plan: Plan, actorUserId: string, expectedRevision: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE plans
        SET name = ${plan.name},
            description = ${plan.description},
            status = ${plan.status},
            priority = ${plan.priority},
            started_at = ${plan.startedAt ?? null},
            estimated_finish_at = ${plan.estimatedFinishAt ?? null},
            finished_at = ${plan.finishedAt ?? null},
            revision = ${plan.revision},
            updated_at = now()
        WHERE id = ${plan.id}
          AND user_id = ${actorUserId}
          AND revision = ${expectedRevision}
        RETURNING revision
      `);

      if (result.rows.length === 0) {
        const [existing] = await tx
          .select({ userId: schema.plans.userId, revision: schema.plans.revision })
          .from(schema.plans)
          .where(eq(schema.plans.id, plan.id));

        classifyUpdateFailure(existing, actorUserId, expectedRevision, {
          notFound: () => new PlanNotFoundError(`Plan not found: ${plan.id}`),
          ownership: () => new PlanOwnershipError(),
          conflict: (message) => new PlanRevisionConflictError(message),
        });
      }

      await tx.delete(schema.planTags).where(eq(schema.planTags.planId, plan.id));
      await insertTags(tx, plan);
    });
  }

  async delete(planId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ userId: schema.plans.userId })
        .from(schema.plans)
        .where(eq(schema.plans.id, planId));

      if (!existing) {
        throw new PlanNotFoundError(`Plan not found: ${planId}`);
      }
      if (existing.userId !== actorUserId) {
        throw new PlanOwnershipError();
      }

      await tx.delete(schema.plans).where(eq(schema.plans.id, planId));
    });
  }

  async findById(planId: string): Promise<Plan | null> {
    const [row] = await this.db.select().from(schema.plans).where(eq(schema.plans.id, planId));
    if (!row) return null;
    return this.hydrate(row);
  }

  async listByUserId(userId: string): Promise<Plan[]> {
    const rows = await this.db.select().from(schema.plans).where(eq(schema.plans.userId, userId));
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  private async hydrate(row: typeof schema.plans.$inferSelect): Promise<Plan> {
    const tagRows = await this.db
      .select({ name: schema.tags.name })
      .from(schema.planTags)
      .innerJoin(schema.tags, eq(schema.planTags.tagId, schema.tags.id))
      .where(eq(schema.planTags.planId, row.id));

    return mapPlanRow(row, tagRows.map((tagRow) => tagRow.name));
  }
}
