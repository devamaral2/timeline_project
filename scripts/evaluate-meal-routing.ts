import { writeFileSync } from "node:fs";
import { JevAgentRouter } from "../apps/api/src/api-core/agent/routing/jev-agent.router";
import type { AgentRoute, RouteDecision } from "../apps/api/src/api-core/agent/routing/agent-router";
import { mealEvaluation } from "../apps/api/src/api-core/agent/testing/evaluation/meal-cases";

/**
 * Mede o roteamento JEV sobre o conjunto de refeicoes (24 pedidos) e reporta
 * acerto, fallbacks para o agente complexo (e por que) e latencia p50/p95.
 *
 *   ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- \
 *     pnpm exec tsx scripts/evaluate-meal-routing.ts [--repeat N] [--json saida.json]
 *
 * Um erro de rota (rota errada que nao e o fallback seguro `complex`) encerra com codigo 1.
 */
const label = (route: AgentRoute) => (route.kind === "single" ? route.skill : route.kind);

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const key = process.env.JEV_API_KEY;
  if (!key) {
    throw new Error("JEV_API_KEY ausente. Execute com ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- pnpm exec tsx scripts/evaluate-meal-routing.ts");
  }
  const repeat = Math.max(1, Number(argument("--repeat") ?? 1));
  const router = new JevAgentRouter(key);
  const now = new Date(mealEvaluation.now);
  const latencies: number[] = [];
  const reasons = new Map<string, number>();
  const rows: Array<Record<string, unknown>> = [];
  let correct = 0;
  let safeFallbacks = 0;
  let wrong = 0;

  for (let round = 0; round < repeat; round += 1) {
    for (const entry of mealEvaluation.cases) {
      let decision: RouteDecision | undefined;
      const actual = await router.route({ text: entry.text, now, history: [], onDecision: (d) => { decision = d; } });
      const expected = entry.expect.route;
      const actualLabel = label(actual);
      const match = actualLabel === expected;
      const fallback = actual.kind === "complex" && expected !== "complex";
      if (match) correct += 1;
      else if (fallback) safeFallbacks += 1;
      else wrong += 1;
      if (decision) latencies.push(decision.latencyMs);
      if (decision?.fallbackReason) reasons.set(decision.fallbackReason, (reasons.get(decision.fallbackReason) ?? 0) + 1);
      rows.push({ id: entry.id, round, expected, actual: actualLabel, status: match ? "ok" : fallback ? "fallback" : "wrong", decision });
      process.stdout.write(`${match ? "OK      " : fallback ? "FALLBACK" : "WRONG   "} ${entry.id} ${actualLabel} (esperado ${expected})${decision?.fallbackReason ? ` [${decision.fallbackReason}]` : ""}\n`);
    }
  }

  const total = mealEvaluation.cases.length * repeat;
  const sorted = [...latencies].sort((a, b) => a - b);
  process.stdout.write(
    `\nResultado: ${correct}/${total} corretos, ${safeFallbacks} fallbacks para o complexo, ${wrong} erros de rota.\n` +
    `Latencia JEV: p50 ${percentile(sorted, 50)} ms, p95 ${percentile(sorted, 95)} ms, max ${sorted.at(-1) ?? 0} ms.\n` +
    `Motivos de fallback: ${[...reasons].map(([reason, count]) => `${reason}=${count}`).join(", ") || "nenhum"}\n`,
  );
  const out = argument("--json");
  if (out) writeFileSync(out, `${JSON.stringify({ model: rows.find((row) => (row.decision as RouteDecision | undefined)?.model)?.decision, rows }, null, 2)}\n`);
  if (wrong) process.exitCode = 1;
}

void main();
