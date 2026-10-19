import { getServerEnv, type ServerEnv } from "../../../config/env";
import { OpenRouterStructuredCompletionGateway } from "../gateways/structured-completion.gateway";
import { EntitySpecialist } from "./entity-specialist";
import type { FastPipeline } from "./fast-pipeline";
import { TurnPlanner } from "./turn-planner";

/** O pipeline rapido so existe com `AI_PIPELINE=fast`; sem isso nada do caminho atual muda. */
export function createFastPipeline(env: ServerEnv = getServerEnv()): FastPipeline | undefined {
  if (env.AI_PIPELINE !== "fast") return undefined;
  const gateway = (model: string | undefined) =>
    new OpenRouterStructuredCompletionGateway(env.OPENROUTER_API_KEY, model ?? env.OPENROUTER_MODEL);
  return {
    planner: new TurnPlanner(gateway(env.OPENROUTER_PLANNER_MODEL)),
    specialist: new EntitySpecialist(gateway(env.OPENROUTER_SPECIALIST_MODEL)),
  };
}
