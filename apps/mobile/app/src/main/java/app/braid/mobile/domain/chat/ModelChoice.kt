package app.braid.mobile.domain.chat

import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOptions
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelProviderOption
import app.braid.mobile.domain.request.ModelSelection
import java.util.Locale

/** O que o aparelho guarda: a escolha atual e o último modelo de cada provedor (a troca de provedor o retoma). */
data class StoredModelSelection(
    val current: ModelSelection,
    val models: Map<ModelProvider, String> = emptyMap(),
)

/** Onde o aparelho guarda a escolha do modo modelo (`braid.model-selection` no web). */
interface ModelSelectionStore {
    /** A escolha guardada; ausente ou ilegível vale `null`. */
    suspend fun read(): StoredModelSelection?

    suspend fun write(state: StoredModelSelection)
}

/** "A OpenAI não está ligada neste ambiente.": o aviso de um comando de provedor sem chave. */
fun providerOffText(provider: ModelProvider): String =
    when (provider) {
        ModelProvider.OpenRouter -> "O OpenRouter não está ligado neste ambiente."
        ModelProvider.OpenAi -> "A OpenAI não está ligada neste ambiente."
        ModelProvider.Anthropic -> "A Anthropic não está ligada neste ambiente."
    }

const val MODEL_OFF_TEXT = "O modo modelo está desligado neste ambiente."

/** O aviso de quando o modo modelo liga: o nome do modelo, o do provedor e como voltar. */
fun modelEnterText(
    options: ModelOptions,
    selection: ModelSelection,
): String =
    "Agora você está falando com ${modelName(options, selection)} (${providerName(options, selection.provider)}). " +
        "Escreva /app para voltar ao assistente da agenda."

fun ModelOptions.providerOf(id: ModelProvider): ModelProviderOption? = providers.firstOrNull { it.id == id }

/** O nome curto do modelo ("Sonnet 5.5"); sem ele na lista, o próprio id. */
fun modelName(
    options: ModelOptions?,
    selection: ModelSelection,
): String =
    options
        ?.providerOf(selection.provider)
        ?.models
        ?.firstOrNull { it.id == selection.model }
        ?.name ?: selection.model

/** O nome do provedor ("Anthropic"); sem ele na lista, o próprio id. */
fun providerName(
    options: ModelOptions?,
    id: ModelProvider,
): String = options?.providerOf(id)?.name?.takeIf { it.isNotEmpty() } ?: id.code

/** O rodapé de uma resposta: "sonnet 5.5 · médio · anthropic". */
fun modelFooter(
    options: ModelOptions?,
    selection: ModelSelection,
): String = "${modelName(options, selection)} · ${selection.effort.label} · ${selection.provider.code}".lowercase(Locale.ROOT)

/** O que o chat diz enquanto espera a resposta do agente: "Falando com o Hermes", "Falando com Sonnet 5.5". */
fun pendingLabelOf(
    agent: ChatAgent,
    selection: ModelSelection?,
    options: ModelOptions?,
): String =
    when (agent) {
        ChatAgent.Hermes -> "Falando com o Hermes"
        ChatAgent.Model -> if (selection != null) "Falando com ${modelName(options, selection)}" else "Falando com o modelo"
    }

/**
 * Confere a escolha guardada contra o que o servidor oferece: provedor desconhecido volta ao padrão do servidor; modelo
 * desconhecido vira o padrão do provedor; esforço desconhecido, o do padrão. Sem nada guardado, o padrão.
 */
fun resolveSelection(
    options: ModelOptions,
    stored: StoredModelSelection?,
): StoredModelSelection {
    val models = stored?.models.orEmpty()
    val current = stored?.current
    val provider = current?.let { options.providerOf(it.provider) }
    if (current == null || provider == null) {
        return StoredModelSelection(options.default, models + (options.default.provider to options.default.model))
    }
    val model = if (provider.models.any { it.id == current.model }) current.model else provider.defaultModel
    val effort = if (current.effort in options.efforts) current.effort else options.default.effort
    return StoredModelSelection(ModelSelection(current.provider, model, effort), models + (current.provider to model))
}

/** Troca de provedor: usa o modelo que ele tinha na última vez (se ainda existe) ou o padrão dele. */
fun StoredModelSelection.withProvider(
    options: ModelOptions,
    id: ModelProvider,
): StoredModelSelection {
    val provider = options.providerOf(id) ?: return this
    val remembered = models[id]
    val model = if (remembered != null && provider.models.any { it.id == remembered }) remembered else provider.defaultModel
    return StoredModelSelection(current.copy(provider = id, model = model), models + (id to model))
}

fun StoredModelSelection.withModel(model: String): StoredModelSelection =
    StoredModelSelection(current.copy(model = model), models + (current.provider to model))

fun StoredModelSelection.withEffort(effort: ModelEffort): StoredModelSelection = copy(current = current.copy(effort = effort))
