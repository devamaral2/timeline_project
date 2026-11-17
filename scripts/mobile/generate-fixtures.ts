/**
 * Gera as fixtures JSON que os testes Kotlin do app Android leem, a partir dos
 * schemas Zod e das funções TypeScript. O app Kotlin não importa os pacotes TS;
 * o que era import vira JSON gerado aqui e conferido pelos testes do app.
 *
 * `pnpm --filter @repo/mobile run test` roda este script antes do Gradle, e por
 * isso mexer em contrato, tema ou timeline acende o teste do mobile.
 *
 * Cada módulo em `fixtures/` devolve `{ nome: json }`; o nome vira
 * `apps/mobile/app/src/test/resources/fixtures/<nome>.json`.
 */
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { agendaFixtures } from "./fixtures/agenda";
import { agentFileFixtures } from "./fixtures/agent-files";
import { agentRequestFixtures } from "./fixtures/agent-request";
import { documentsFixtures } from "./fixtures/documents";
import { executorFixtures } from "./fixtures/executor";
import { sessionFixtures } from "./fixtures/session";
import { taskListFixtures } from "./fixtures/task-list";
import { tasksFixtures } from "./fixtures/tasks";
import { taskDetailFixtures } from "./fixtures/task-detail";
import { timelineFixtures } from "./fixtures/timeline";

/** O zod que o `packages/contracts` resolve: o raiz do repositório não o tem. */
const requireFromContracts = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
// biome-ignore lint/suspicious/noExplicitAny: o tipo do zod vive no pacote de contratos.
export type FixtureContext = { z: any };

export const fixtureDirectory = fileURLToPath(new URL("../../apps/mobile/app/src/test/resources/fixtures/", import.meta.url));

export function collectFixtures(): Record<string, unknown> {
  const context: FixtureContext = { z: requireFromContracts("zod").z };
  return { ...sessionFixtures(context), ...timelineFixtures(), ...tasksFixtures(), ...taskListFixtures(), ...executorFixtures(), ...taskDetailFixtures(), ...agendaFixtures(), ...documentsFixtures(), ...agentRequestFixtures(), ...agentFileFixtures(context) };
}

export function generateFixtures(): string[] {
  const fixtures = collectFixtures();
  mkdirSync(fixtureDirectory, { recursive: true });
  // Fixture que o script não gera mais some junto, em vez de apodrecer.
  for (const file of readdirSync(fixtureDirectory)) {
    if (file.endsWith(".json")) rmSync(`${fixtureDirectory}${file}`);
  }
  for (const [name, value] of Object.entries(fixtures)) {
    writeFileSync(`${fixtureDirectory}${name}.json`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  return Object.keys(fixtures);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = generateFixtures();
  console.log(`Generated ${names.length} fixtures in ${fixtureDirectory}`);
}
