import type { EntitySpecialist } from "./entity-specialist";
import type { TurnPlanner } from "./turn-planner";

/** As duas etapas do pipeline rapido (ADR 002). A junção e o commit ficam no `RunAgentUseCase`. */
export interface FastPipeline {
  planner: Pick<TurnPlanner, "plan">;
  specialist: Pick<EntitySpecialist, "fill">;
}
