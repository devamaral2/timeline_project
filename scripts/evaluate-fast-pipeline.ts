import { writeFileSync } from "node:fs";
import { getServerEnv } from "../apps/api/src/config/env";
import { agentsConfig } from "../apps/api/src/api-core/agent/config/agent-config";
import { createFastPipeline } from "../apps/api/src/api-core/agent/fast/create-fast-pipeline";
import type { TurnPlan } from "../apps/api/src/api-core/agent/fast/turn-planner";
import { AGENT_SKILLS } from "../apps/api/src/api-core/agent/skills/agent-skill-registry";
import { mealEvaluation, type MealCase } from "../apps/api/src/api-core/agent/testing/evaluation/meal-cases";

/**
 * Mede o pipeline rapido (ADR 002) sobre o conjunto de refeicoes: o planejador escolheu as
 * operacoes certas? o especialista extraiu horario e alimentos? quanto tempo cada etapa levou?
 * O mesmo conjunto mede o roteamento JEV em `evaluate-meal-routing.ts`, para a comparacao.
 *
 *   ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- \
 *     pnpm exec tsx scripts/evaluate-fast-pipeline.ts [--repeat N] [--json saida.json]
 *
 * Usa OPENROUTER_PLANNER_MODEL / OPENROUTER_SPECIALIST_MODEL (senao OPENROUTER_MODEL). Plano errado
 * (operacao diferente da esperada, que nao e a volta segura ao caminho legado) encerra com codigo 1.
 */
type Expected = { kind: "write"; skills: string[] } | { kind: "legacy"; reason: string };

/** Os casos que o conjunto marca como `complex` tem plano proprio no pipeline rapido. */
const FAST_EXPECTATION: Record<string, Expected> = {
  "meal-020": { kind: "write", skills: ["save_meal_event", "save_training_event"] },
  "meal-021": { kind: "write", skills: ["save_meal_event", "save_task"] },
  "meal-022": { kind: "legacy", reason: "other" },
  "meal-024": { kind: "write", skills: ["save_note"] },
};

function expectedOf(entry: MealCase): Expected {
  const override = FAST_EXPECTATION[entry.id];
  if (override) return override;
  const { route } = entry.expect;
  if (route === "read") return { kind: "legacy", reason: "read" };
  if (route === "save_recurrence") return { kind: "legacy", reason: "other" };
  return { kind: "write", skills: [route] };
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const OFFSET_MS = 3 * 60 * 60 * 1000; // America/Sao_Paulo, sem horario de verao desde 2019

function startedAtMatches(args: Record<string, unknown>, entry: MealCase, now: Date): boolean | undefined {
  const expected = entry.expect.startedAt;
  if (!expected) return undefined;
  const raw = args.startedAt;
  const actual = typeof raw === "string" ? new Date(raw) : now;
  if (Number.isNaN(actual.getTime())) return false;
  if (expected.kind === "now") return Math.abs(actual.getTime() - now.getTime()) <= 5 * 60_000;
  if (expected.kind === "relative") return Math.abs(actual.getTime() - (now.getTime() + expected.minutes * 60_000)) <= 5 * 60_000;
  const local = new Date(actual.getTime() - OFFSET_MS).toISOString();
  const day = new Date(now.getTime() - OFFSET_MS + expected.dayOffset * 86_400_000).toISOString().slice(0, 10);
  return local.slice(0, 10) === day && local.slice(11, 16) === expected.time;
}

function foodsMatch(args: Record<string, unknown>, entry: MealCase): boolean | undefined {
  const foods = entry.expect.foods;
  if (!foods) return undefined;
  const text = normalize(String(args.inputText ?? ""));
  return foods.every((food) =>
    text.includes(normalize(food.name)) && (!food.quantity || /^\d+$/.test(food.quantity) || text.includes(normalize(food.quantity))));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const rate = (hit: number, total: number) => (total ? `${hit}/${total}` : "-");

async function main() {
  const env = getServerEnv();
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY ausente. Execute com ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- pnpm exec tsx scripts/evaluate-fast-pipeline.ts");
  }
  const pipeline = createFastPipeline({ ...env, AI_PIPELINE: "fast" });
  if (!pipeline) throw new Error("Pipeline rapido indisponivel");
  const repeat = Math.max(1, Number(argument("--repeat") ?? 1));
  const now = new Date(mealEvaluation.now);
  const skills = new Map(AGENT_SKILLS.map((skill) => [skill.name, skill]));

  const planMs: number[] = [];
  const specialistMs: number[] = [];
  const totalMs: number[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const counts = { plans: 0, planOk: 0, safeLegacy: 0, planWrong: 0, time: [0, 0], foods: [0, 0] };

  for (let round = 0; round < repeat; round += 1) {
    for (const entry of mealEvaluation.cases) {
      const expected = expectedOf(entry);
      const startedAt = performance.now();
      let plan: TurnPlan;
      try {
        plan = await pipeline.planner.plan({ text: entry.text, now });
      } catch (error) {
        const name = error instanceof Error ? error.name : "erro";
        const reason = (error as { reason?: string; status?: number }).reason;
        const status = (error as { status?: number }).status;
        process.stdout.write(`ERRO     ${entry.id} planejador: ${name}${reason ? ` ${reason}` : ""}${status ? ` http ${status}` : ""} ${Math.round(performance.now() - startedAt)}ms\n`);
        rows.push({ id: entry.id, round, status: "planner_error", error: name });
        counts.plans += 1;
        counts.planWrong += 1;
        continue;
      }
      const planTook = Math.round(performance.now() - startedAt);
      planMs.push(planTook);
      counts.plans += 1;

      const actual = plan.kind === "write" ? plan.operations.map((operation) => `${operation.skill}:${operation.mode}`) : [plan.kind];
      const wanted = expected.kind === "write"
        ? expected.skills.map((skill) => {
          const mode = skill === "finish_event" ? "update" : expected.skills.length === 1 ? (entry.expect.operation ?? "create") : "create";
          return `${skill}:${mode}`;
        })
        : [];
      const planMatches = expected.kind === "write"
        ? plan.kind === "write" && actual.join(",") === wanted.join(",")
        : plan.kind === "legacy";
      const safe = !planMatches && plan.kind === "legacy";
      if (planMatches) counts.planOk += 1;
      else if (safe) counts.safeLegacy += 1;
      else counts.planWrong += 1;

      let timeOk: boolean | undefined;
      let foodsOk: boolean | undefined;
      let specialistTook: number | undefined;
      let specialistArgs: unknown;
      // Alterar um evento depende do dia lido pelo servidor; aqui so se mede a criacao.
      if (planMatches && plan.kind === "write" && plan.operations.length === 1 && plan.operations[0].mode === "create") {
        const operation = plan.operations[0];
        const skill = skills.get(operation.skill);
        if (skill && operation.skill === "save_meal_event") {
          const specialistStart = performance.now();
          try {
            const result = await pipeline.specialist.fill({ operation, skill, request: entry.text, now });
            specialistTook = Math.round(performance.now() - specialistStart);
            specialistMs.push(specialistTook);
            specialistArgs = result.kind === "command" ? result.args : { clarification: result.question };
            if (result.kind === "command") {
              timeOk = startedAtMatches(result.args, entry, now);
              foodsOk = foodsMatch(result.args, entry);
            } else {
              timeOk = false;
              foodsOk = false;
            }
          } catch (error) {
            specialistArgs = { error: (error as { reason?: string }).reason ?? (error instanceof Error ? error.name : "erro") };
            timeOk = false;
            foodsOk = false;
          }
          if (timeOk !== undefined) { counts.time[1] += 1; if (timeOk) counts.time[0] += 1; }
          if (foodsOk !== undefined) { counts.foods[1] += 1; if (foodsOk) counts.foods[0] += 1; }
        }
      }
      totalMs.push(planTook + (specialistTook ?? 0));
      const status = planMatches ? "ok" : safe ? "legacy" : "wrong";
      rows.push({ id: entry.id, round, status, actual, expected, planMs: planTook, specialistMs: specialistTook, timeOk, foodsOk, specialistArgs });
      process.stdout.write(
        `${status === "ok" ? "OK      " : status === "legacy" ? "LEGADO  " : "WRONG   "} ${entry.id} ${actual.join("+")} ` +
        `(esperado ${expected.kind === "write" ? expected.skills.join("+") : `legacy:${expected.reason}`})` +
        `${timeOk === false ? " [horario]" : ""}${foodsOk === false ? " [alimentos]" : ""} ${planTook}ms${specialistTook ? `+${specialistTook}ms` : ""}\n`,
      );
    }
  }

  const stat = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return `p50 ${percentile(sorted, 50)} ms, p95 ${percentile(sorted, 95)} ms, max ${sorted.at(-1) ?? 0} ms`;
  };
  process.stdout.write(
    `\nPlano: ${counts.planOk}/${counts.plans} corretos, ${counts.safeLegacy} voltaram ao caminho legado, ${counts.planWrong} planos errados.\n` +
    `Horario (criacao de refeicao): ${rate(counts.time[0], counts.time[1])}. Alimentos: ${rate(counts.foods[0], counts.foods[1])}.\n` +
    `Planejador: ${stat(planMs)}\nEspecialista: ${stat(specialistMs)}\nPlanejador + especialista: ${stat(totalMs)}\n` +
    `Orcamentos: planejador ${agentsConfig.fast.plannerTimeoutMs} ms, especialista ${agentsConfig.fast.specialistTimeoutMs} ms.\n`,
  );
  const out = argument("--json");
  if (out) writeFileSync(out, `${JSON.stringify({ counts, rows }, null, 2)}\n`);
  if (counts.planWrong) process.exitCode = 1;
}

void main();
