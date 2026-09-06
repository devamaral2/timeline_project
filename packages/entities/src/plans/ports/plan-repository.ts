import type { Plan } from "../entities/plan.entity";

export interface PlanRepository {
  save(plan: Plan): Promise<void>;
  update(plan: Plan, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(planId: string, actorUserId: string): Promise<void>;
  findById(planId: string): Promise<Plan | null>;
  listByUserId(userId: string): Promise<Plan[]>;
}
