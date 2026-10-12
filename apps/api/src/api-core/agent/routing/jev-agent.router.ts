import { z } from "zod";
import { getServerEnv } from "../../../config/env";
import { jevRoutingConfig } from "../config/agent-config";
import type { AgentRoute, AgentRouter } from "./agent-router";

const choice = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
});

const responseSchema = z.object({
  model: z.string(),
  answers: z.object({ goal: choice, count: choice, target: choice }),
});

const { endpoint, model, timeoutMs, minCertainty, historyTurns, targetSkills, questions } = jevRoutingConfig;

function accepted(answer: z.infer<typeof choice>): boolean {
  return answer.confidence > minCertainty && (answer.probabilities[answer.choice] ?? 0) > minCertainty;
}

export class JevAgentRouter implements AgentRouter {
  constructor(
    private readonly apiKey: string | undefined = getServerEnv().JEV_API_KEY,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey && process.env.NODE_ENV === "production") throw new Error("JEV_API_KEY is required in production");
  }

  async route(input: Parameters<AgentRouter["route"]>[0]): Promise<AgentRoute> {
    if (!this.apiKey) return { kind: "complex" };
    const startedAt = performance.now();
    const signal = input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    try {
      const response = await this.request(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          state: {
            message: input.text,
            screen: input.context ?? null,
            now: input.now.toISOString(),
            history: input.history?.slice(-historyTurns).map((turn) => ({ role: turn.role, text: turn.text })) ?? [],
          },
          questions,
        }),
        signal,
      });
      if (!response.ok) throw new Error(`JEV returned HTTP ${response.status}`);
      const parsed = responseSchema.parse(await response.json());
      const { goal, count, target } = parsed.answers;
      let route: AgentRoute = { kind: "complex" };
      if (accepted(goal)) {
        if (goal.choice === "read") route = { kind: "read" };
        else if (goal.choice === "write" && accepted(count) && count.choice === "one" && accepted(target)) {
          const skill = targetSkills[target.choice] as Extract<AgentRoute, { kind: "single" }>["skill"] | undefined;
          if (skill) route = { kind: "single", skill };
        }
      }
      console.info("[JevAgentRouter] decision", {
        route: route.kind === "single" ? route.skill : route.kind,
        model: parsed.model,
        latencyMs: Math.round(performance.now() - startedAt),
        goal: judgmentSummary(goal),
        count: goal.choice === "write" ? judgmentSummary(count) : undefined,
        target: goal.choice === "write" && count.choice === "one" ? judgmentSummary(target) : undefined,
      });
      return route;
    } catch (error) {
      if (input.signal?.aborted) throw error;
      console.warn("[JevAgentRouter] falling back to complex agent", {
        reason: error instanceof Error ? error.message : "unknown error",
        latencyMs: Math.round(performance.now() - startedAt),
      });
      return { kind: "complex" };
    }
  }
}

function judgmentSummary(answer: z.infer<typeof choice>) {
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probability: answer.probabilities[answer.choice] ?? 0,
  };
}
