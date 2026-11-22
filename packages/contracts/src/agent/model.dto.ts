/**
 * O modo modelo do chat (ADR 0019): a mensagem vai direto a um modelo escolhido pelo usuario, que usa a agenda pelo
 * MCP. O usuario escolhe o provedor, o modelo e o esforco; o servidor diz quais existem.
 */

/** Quem atende o modelo: a API da Anthropic, a da OpenAI ou o OpenRouter. */
export type ModelProvider = "anthropic" | "openai" | "openrouter";

/** Quanto o modelo pensa: Baixo, Medio, Alto e Maximo. Cada provedor traduz para a propria escala. */
export type ModelEffort = "low" | "medium" | "high" | "max";

/** O que o usuario escolheu para um pedido. */
export interface ModelSelection {
  provider: ModelProvider;
  /** O id do modelo no provedor (`claude-opus-5-5`, `gpt-6.2-sol`, `google/gemini-4-neon`). */
  model: string;
  effort: ModelEffort;
}

export interface ModelOptionDto {
  id: string;
  /** O nome curto que o seletor mostra ("Opus 5.5"). */
  name: string;
}

export interface ModelProviderOptionDto {
  id: ModelProvider;
  /** "Anthropic", "OpenAI", "OpenRouter". */
  name: string;
  models: ModelOptionDto[];
  /** O modelo que o seletor marca ao trocar para este provedor. */
  defaultModel: string;
}

/**
 * `GET /api/requests/model/options`: os provedores com chave neste ambiente, os modelos de cada um e a escolha
 * padrao. Sem nenhum provedor, responde 404, como `POST /api/requests/model`.
 */
export interface ModelOptionsDto {
  providers: ModelProviderOptionDto[];
  efforts: ModelEffort[];
  default: ModelSelection;
}

/**
 * `POST /api/requests/model`. Responde `202` com o pedido. O corpo do Hermes mais a escolha do modelo; um provedor
 * sem chave ou um modelo fora da lista responde 400.
 */
export interface StartModelRequestInput {
  userId: string;
  text: string;
  sessionId?: string;
  clientMessageId: string;
  model: ModelSelection;
}
