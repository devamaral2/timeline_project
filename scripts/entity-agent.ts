#!/usr/bin/env tsx
/**
 * CLI do agente de entidades da timeline.
 *
 * O agente le a conversa (skill `entidades`) e traduz o pedido para
 * um ou mais comandos. Este arquivo aplica os comandos ao plano local e imprime
 * o JSON completo — nao ha chamada de modelo nem escrita no Postgres aqui.
 *
 *   pnpm --silent entity-agent --command '{"op":"log-training",...}'
 *   pnpm --silent entity-agent show
 *   pnpm --silent entity-agent reset
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  applyEntityCommands,
  assertPlanConsistency,
  emptyEntityPlan,
  parseEntityCommand,
  parseEntityPlan,
  type EntityCommand,
  type EntityPlan,
} from "../apps/api/src/api-core/entity-agent/index";

const DEFAULT_STATE_PATH = ".agents/local/entidades/plan.json";

interface CliOptions {
  action: "apply" | "show" | "reset" | "help";
  statePath: string;
  now: Date;
  command?: unknown;
  compact: boolean;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`A flag ${name} precisa de um valor.`);
  }
  args.splice(index, 2);
  return value;
}

function parseOptions(argv: string[]): CliOptions {
  const args = [...argv];
  const compact = args.includes("--compact");
  if (compact) args.splice(args.indexOf("--compact"), 1);

  const statePath = resolve(
    process.cwd(),
    flag(args, "--state") ?? process.env.ENTITY_AGENT_STATE ?? DEFAULT_STATE_PATH,
  );
  const now = parseNow(flag(args, "--now"));
  const commandJson = flag(args, "--command");

  const first = args[0];
  if (first === "show") return { action: "show", statePath, now, compact };
  if (first === "reset") return { action: "reset", statePath, now, compact };
  if (first === "help" || first === "--help" || first === "-h") {
    return { action: "help", statePath, now, compact };
  }

  let command: unknown = commandJson === undefined ? undefined : parseJson(commandJson);
  if (command === undefined) {
    const positional = args.find((value) => value.trim().startsWith("{") || value.trim().startsWith("["));
    if (positional) command = parseJson(positional);
  }
  if (command === undefined) {
    throw new Error("Informe os comandos com --command '<json>'.");
  }
  return { action: "apply", statePath, now, command, compact };
}

function parseNow(value: string | undefined): Date {
  if (!value) return new Date();
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error(`--now inválido: ${value}`);
  return instant;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("O comando não é um JSON válido.");
  }
}

function readPlan(path: string, now: Date): EntityPlan {
  if (!existsSync(path)) return emptyEntityPlan(now);
  const parsed = parseEntityPlan(JSON.parse(readFileSync(path, "utf8")));
  assertPlanConsistency(parsed);
  return parsed;
}

function writePlan(path: string, plan: EntityPlan): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

function printPlan(plan: EntityPlan, compact: boolean): void {
  process.stdout.write(`${JSON.stringify(plan, null, compact ? undefined : 2)}\n`);
}

function toCommands(value: unknown): EntityCommand[] {
  if (Array.isArray(value)) return value.map(parseEntityCommand);
  return [parseEntityCommand(value)];
}

function help(): string {
  return [
    "Agente de entidades da timeline — aplica comandos e imprime o plano completo.",
    "",
    "Uso:",
    "  pnpm --silent entity-agent --command '<comando ou lista>' [--state <arquivo>] [--now <iso>]",
    "  pnpm --silent entity-agent show [--state <arquivo>]",
    "  pnpm --silent entity-agent reset [--state <arquivo>]",
    "",
    "Comandos:",
    "  log-training  { workoutCode, activity?, durationMinutes?, calories?, paceMinPerKm?, distanceKm?, ... }",
    "  log-meal      { items, name?, durationMinutes?, ... }",
    "  log-routine   { name, description?, durationMinutes?, ... }",
    "  log-sleep     { trackedSleepTimeMinutes, score?, ... }",
    "  log-task      { name, description?, status?, priority?, estimatedFinishAt?, durationMinutes?, ... }",
    "",
    `Padrão do estado: ${resolve(process.cwd(), DEFAULT_STATE_PATH)}`,
  ].join("\n");
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  if (options.action === "help") {
    process.stdout.write(`${help()}\n`);
    return;
  }
  if (options.action === "show") {
    printPlan(readPlan(options.statePath, options.now), options.compact);
    return;
  }
  if (options.action === "reset") {
    const plan = emptyEntityPlan(options.now);
    writePlan(options.statePath, plan);
    printPlan(plan, options.compact);
    return;
  }

  const current = readPlan(options.statePath, options.now);
  const result = applyEntityCommands(current, toCommands(options.command), { now: options.now });
  writePlan(options.statePath, result.plan);
  printPlan(result.plan, options.compact);
}

try {
  main();
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`entity-agent: ${message}\n`);
  process.exitCode = 1;
}
