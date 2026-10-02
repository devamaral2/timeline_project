import { z } from "zod";
import { getServerEnv } from "../../../config/env";
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

const MIN_CERTAINTY = 0.92;
const TIMEOUT_MS = 8_000;

function accepted(answer: z.infer<typeof choice>): boolean {
  return answer.confidence > MIN_CERTAINTY && (answer.probabilities[answer.choice] ?? 0) > MIN_CERTAINTY;
}

const targets = {
  routine: "save_routine_event",
  meal: "save_meal_event",
  training: "save_training_event",
  sleep: "save_sleep_event",
  task: "save_task",
} as const;

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
      ? AbortSignal.any([input.signal, AbortSignal.timeout(TIMEOUT_MS)])
      : AbortSignal.timeout(TIMEOUT_MS);
    try {
      const response = await this.request("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "jev-latest",
          state: {
            message: input.text,
            screen: input.context ?? null,
            now: input.now.toISOString(),
            history: input.history?.slice(-4).map((turn) => ({ role: turn.role, text: turn.text })) ?? [],
          },
          questions: {
            goal: {
              type: "choice",
              instructions: "Qual é o resultado pedido para uma timeline pessoal? Relatos de atividades ('almocei', 'treinei', 'dormi', 'estou trabalhando') implicam registrar um evento. 'Parei de trabalhar' implica atualizar o evento em andamento. Consultas feitas apenas para preparar uma escrita não tornam o pedido misto.",
              criteria: {
                read: "Responder uma pergunta usando dados, sem criar, alterar ou apagar registros.",
                write: "Criar, registrar ou alterar registros, inclusive quando o usuário relata uma atividade realizada, iniciada ou terminada; consultas internas para identificar os dados não contam como resposta de consulta.",
                read_write: "O usuário pediu explicitamente uma resposta de consulta e também uma criação ou alteração.",
                other: "Apagar, conversar sem dados, pedido incompreensível ou outra intenção.",
              },
            },
            count: {
              type: "choice",
              instructions: "Se o pedido cria ou altera registros, quantas entidades principais ele quer criar ou alterar? Um relato singular de refeição, treino, sono ou trabalho representa uma entidade. Ignore ajustes automáticos de horários em outros eventos.",
              criteria: {
                one: "Exatamente uma entidade principal.",
                many: "Duas ou mais entidades principais.",
                unclear: "Quantidade indefinida ou sem criação/alteração.",
              },
            },
            target: {
              type: "choice",
              instructions: "Se há exatamente uma entidade principal para criar ou alterar, qual é seu tipo?",
              criteria: {
                routine: "Evento de rotina, trabalho, estudo, reunião, deslocamento ou lazer.",
                meal: "Evento de alimento, bebida ou refeição.",
                training: "Evento de exercício físico ou treino.",
                sleep: "Evento de sono ou cochilo.",
                task: "Tarefa ou subtarefa.",
                other: "Nota, exclusão, tipo desconhecido ou nenhuma entidade.",
              },
            },
          },
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
          const skill = targets[target.choice as keyof typeof targets];
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
