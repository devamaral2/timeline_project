package app.braid.mobile.domain.request

/** Quem atende o modo modelo (ADR 0019): a API da Anthropic, a da OpenAI ou o OpenRouter; [code] é o id do contrato. */
enum class ModelProvider(
    val code: String,
) {
    Anthropic("anthropic"),
    OpenAi("openai"),
    OpenRouter("openrouter"),
    ;

    companion object {
        fun fromCodeOrNull(code: String?): ModelProvider? = entries.firstOrNull { it.code == code }
    }
}

/** Quanto o modelo pensa; [label] é o texto da tela. */
enum class ModelEffort(
    val code: String,
    val label: String,
) {
    Low("low", "Baixo"),
    Medium("medium", "Médio"),
    High("high", "Alto"),
    Max("max", "Máximo"),
    ;

    companion object {
        fun fromCodeOrNull(code: String?): ModelEffort? = entries.firstOrNull { it.code == code }
    }
}

/** O que a pessoa escolheu para um pedido: o [model] é o id dele no provedor. */
data class ModelSelection(
    val provider: ModelProvider,
    val model: String,
    val effort: ModelEffort,
)

data class ModelOption(
    val id: String,
    /** O nome curto que o seletor mostra ("Sonnet 5.5"). */
    val name: String,
)

data class ModelProviderOption(
    val id: ModelProvider,
    /** "Anthropic", "OpenAI", "OpenRouter". */
    val name: String,
    val models: List<ModelOption>,
    /** O modelo que o seletor marca ao trocar para este provedor. */
    val defaultModel: String,
)

/** `GET /api/requests/model/options`: os provedores com chave neste ambiente, os modelos de cada um e a escolha padrão. */
data class ModelOptions(
    val providers: List<ModelProviderOption>,
    val efforts: List<ModelEffort>,
    val default: ModelSelection,
)
