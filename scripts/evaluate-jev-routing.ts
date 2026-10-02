import { JevAgentRouter } from "../apps/api/src/api-core/agent/routing/jev-agent.router";
import type { AgentRoute } from "../apps/api/src/api-core/agent/routing/agent-router";

const cases: Array<{ label: string; text: string; expected: AgentRoute }> = [
  { label: "consulta diária", text: "O que fiz ontem?", expected: { kind: "read" } },
  { label: "consulta de duração", text: "Quanto tempo trabalhei hoje?", expected: { kind: "read" } },
  { label: "criação de tarefa", text: "Crie a tarefa comprar pão amanhã", expected: { kind: "single", skill: "save_task" } },
  { label: "update de tarefa", text: "Marque a tarefa comprar pão como concluída", expected: { kind: "single", skill: "save_task" } },
  { label: "criação de rotina", text: "Estou trabalhando agora e paro às 18h", expected: { kind: "single", skill: "save_routine_event" } },
  { label: "update de rotina", text: "Parei de trabalhar agora", expected: { kind: "single", skill: "save_routine_event" } },
  { label: "alimentação", text: "Almocei arroz e frango às 13h", expected: { kind: "single", skill: "save_meal_event" } },
  { label: "treino", text: "Treinei corrida por 40 minutos hoje", expected: { kind: "single", skill: "save_training_event" } },
  { label: "sono", text: "Dormi das 23h às 7h", expected: { kind: "single", skill: "save_sleep_event" } },
  { label: "múltiplas entidades", text: "Crie uma tarefa comprar pão e um evento de mercado para amanhã", expected: { kind: "complex" } },
  { label: "exclusão lógica", text: "Apague meu evento de trabalho de hoje", expected: { kind: "complex" } },
  { label: "pedido misto", text: "Quanto tempo trabalhei hoje? E crie uma tarefa para revisar o relatório", expected: { kind: "complex" } },
  { label: "nota", text: "Anote que preciso discutir as férias com Ana", expected: { kind: "complex" } },
  { label: "conversa livre", text: "Olá, tudo bem?", expected: { kind: "complex" } },
];

async function main() {
  const key = process.env.JEV_API_KEY;
  if (!key) throw new Error("JEV_API_KEY ausente. Execute com ONEPASSWORD_SCOPE=api-runtime pnpm secrets:exec -- pnpm exec tsx scripts/evaluate-jev-routing.ts");

  const router = new JevAgentRouter(key);
  let correct = 0;
  let safeFallbacks = 0;
  let unsafe = 0;
  for (const entry of cases) {
    const actual = await router.route({ text: entry.text, now: new Date(), history: [] });
    const expectedLabel = entry.expected.kind === "single" ? entry.expected.skill : entry.expected.kind;
    const actualLabel = actual.kind === "single" ? actual.skill : actual.kind;
    const match = actualLabel === expectedLabel;
    const fallback = actual.kind === "complex" && entry.expected.kind !== "complex";
    if (match) correct += 1;
    else if (fallback) safeFallbacks += 1;
    else unsafe += 1;
    process.stdout.write(`${match ? "OK" : fallback ? "FALLBACK" : "UNSAFE"} ${entry.label}: ${actualLabel} (esperado ${expectedLabel})\n`);
  }
  process.stdout.write(`Resultado: ${correct}/${cases.length} corretos, ${safeFallbacks} fallbacks seguros, ${unsafe} erros de rota.\n`);
  if (unsafe) process.exitCode = 1;
}

void main();
