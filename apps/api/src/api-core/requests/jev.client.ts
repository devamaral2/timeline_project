import { Logger } from "../../common/logger";
import { z } from "zod";
import { getServerEnv } from "../../config/env";
import type { ChoiceQuestion } from "./request-config";

const choiceAnswer = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
});

const responseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), choiceAnswer),
});

export interface JevAnswer {
  choice: string;
  confidence: number;
  probability: number;
}

export interface JevCall {
  endpoint: string;
  model: string;
  timeoutMs: number;
}

export interface JevResult {
  model: string;
  latencyMs: number;
  answers: Record<string, JevAnswer>;
}

/** O JEV da rota por passos nao esta configurado (sem `JEV_API_KEY`). */
export class JevUnavailableError extends Error {
  constructor(readonly reason: "no_api_key" | "provider") {
    super("JEV indisponivel");
    this.name = "JevUnavailableError";
  }
}

/** Uma chamada ao JEV com varias perguntas `Choice`, respondidas em paralelo pelo provedor. */
export class JevClient {
  private readonly logger = new Logger(JevClient.name);

  constructor(
    private readonly apiKey: string | undefined = getServerEnv().JEV_API_KEY,
    private readonly request: typeof fetch = fetch,
  ) {}

  async ask(
    call: JevCall,
    state: Record<string, unknown>,
    questions: Readonly<Record<string, ChoiceQuestion>>,
    signal?: AbortSignal,
  ): Promise<JevResult> {
    if (!this.apiKey) throw new JevUnavailableError("no_api_key");
    const startedAt = performance.now();
    const timeout = AbortSignal.timeout(call.timeoutMs);
    try {
      const response = await this.request(call.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: call.model, state, questions }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`JEV returned HTTP ${response.status}`);
      const parsed = responseSchema.parse(await response.json());
      const answers: Record<string, JevAnswer> = {};
      for (const [name, answer] of Object.entries(parsed.answers)) {
        answers[name] = {
          choice: answer.choice,
          confidence: answer.confidence,
          probability: answer.probabilities[answer.choice] ?? 0,
        };
      }
      return { model: parsed.model, latencyMs: Math.round(performance.now() - startedAt), answers };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.logger.warn(`JEV falhou (${Object.keys(questions).length} perguntas, ${Math.round(performance.now() - startedAt)}ms): ${error instanceof Error ? error.message : String(error)}`);
      throw new JevUnavailableError("provider");
    }
  }
}

/** Mesmo criterio dos demais usos do JEV: confianca e probabilidade da escolha acima do minimo. */
export function isAccepted(answer: JevAnswer | undefined, minCertainty: number): answer is JevAnswer {
  return answer !== undefined && answer.confidence > minCertainty && answer.probability > minCertainty;
}
