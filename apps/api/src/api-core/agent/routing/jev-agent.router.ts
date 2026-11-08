import { z } from "zod";
import { getServerEnv } from "../../../config/env";
import { jevRoutingConfig } from "../config/agent-config";
import type { AgentRoute, AgentRouter, RouteDecision } from "./agent-router";

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

function accepted(answer: z.infer<typeof choice>): boolean {
  const { minCertainty } = jevRoutingConfig;
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
    const { endpoint, model, timeoutMs, historyTurns, targetSkills, questions } = jevRoutingConfig;
    if (!this.apiKey) {
      input.onDecision?.({ source: "none", latencyMs: 0, fallbackReason: "no_api_key" });
      return { kind: "complex" };
    }
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
      let fallbackReason: string | undefined;
      if (!accepted(goal)) fallbackReason = "goal_uncertain";
      else if (goal.choice === "read") route = { kind: "read" };
      else if (goal.choice !== "write") fallbackReason = `goal_${goal.choice}`;
      else if (!accepted(count)) fallbackReason = "count_uncertain";
      else if (count.choice !== "one") fallbackReason = `count_${count.choice}`;
      else if (!accepted(target)) fallbackReason = "target_uncertain";
      else {
        const skill = targetSkills[target.choice] as Extract<AgentRoute, { kind: "single" }>["skill"] | undefined;
        if (skill) route = { kind: "single", skill };
        else fallbackReason = `target_${target.choice}`;
      }
      const decision: RouteDecision = {
        source: "jev",
        model: parsed.model,
        latencyMs: Math.round(performance.now() - startedAt),
        ...(fallbackReason ? { fallbackReason } : {}),
        goal: judgmentSummary(goal),
        ...(goal.choice === "write" ? { count: judgmentSummary(count) } : {}),
        ...(goal.choice === "write" && count.choice === "one" ? { target: judgmentSummary(target) } : {}),
      };
      input.onDecision?.(decision);
      console.info("[JevAgentRouter] decision", {
        route: route.kind === "single" ? route.skill : route.kind,
        ...decision,
      });
      return route;
    } catch (error) {
      if (input.signal?.aborted) throw error;
      const latencyMs = Math.round(performance.now() - startedAt);
      input.onDecision?.({ source: "jev", latencyMs, fallbackReason: `provider_${errorKind(error)}` });
      console.warn("[JevAgentRouter] falling back to complex agent", {
        reason: error instanceof Error ? error.message : "unknown error",
        latencyMs,
      });
      return { kind: "complex" };
    }
  }
}

function errorKind(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  if (error instanceof z.ZodError) return "invalid_response";
  return "error";
}

function judgmentSummary(answer: z.infer<typeof choice>) {
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probability: answer.probabilities[answer.choice] ?? 0,
  };
}
