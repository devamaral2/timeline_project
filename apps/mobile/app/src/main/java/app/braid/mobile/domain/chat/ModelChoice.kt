package app.braid.mobile.domain.chat

import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOption
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

/**
 * Onde o aparelho guarda a escolha do modo modelo (`braid.model-selection` no web) e, ao lado dela, os modelos favoritos da
 * folha (`braid.model-favorites`).
 */
interface ModelSelectionStore {
    /** A escolha guardada; ausente ou ilegível vale `null`. */
    suspend fun read(): StoredModelSelection?

    suspend fun write(state: StoredModelSelection)

    /** Os favoritos guardados, na ordem em que foram guardados; ausentes ou ilegíveis valem lista vazia. */
    suspend fun readFavorites(): List<ModelFavorite>

    suspend fun writeFavorites(favorites: List<ModelFavorite>)
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

/**
 * Os modelos que a busca acha: cada palavra precisa aparecer no nome ou no id, sem acento e sem caixa ("gemini" acha
 * "Google: Gemini 4 Neon"; "x-ai" acha `x-ai/grok-4.7`). Busca vazia devolve a lista inteira.
 */
fun filterModels(
    models: List<ModelOption>,
    query: String,
): List<ModelOption> {
    val words = searchWords(query)
    return if (words.isEmpty()) models else models.filter { matchesWords(words, it.name, it.id) }
}

private fun searchWords(query: String): List<String> = searchKey(query).split(Regex("\\s+")).filter { it.isNotEmpty() }

/** Toda palavra da busca precisa aparecer no nome ou no id; sem palavras, tudo vale. */
private fun matchesWords(
    words: List<String>,
    name: String,
    id: String,
): Boolean {
    if (words.isEmpty()) return true
    val haystack = searchKey("$name $id")
    return words.all { haystack.contains(it) }
}

private fun searchKey(text: String): String =
    java.text.Normalizer
        .normalize(text, java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"), "")
        .lowercase(Locale.ROOT)

/** Um modelo favorito: o id dele e o provedor que o atende (o mesmo modelo pode existir em dois provedores). */
data class ModelFavorite(
    val provider: ModelProvider,
    val model: String,
)

/** A aba aberta na folha da escolha: os favoritos ou os modelos de um provedor. Trocar de aba não troca a escolha. */
sealed interface ModelTab {
    data object Favorites : ModelTab

    data class OfProvider(
        val id: ModelProvider,
    ) : ModelTab
}

/** Uma linha da lista de modelos da folha. */
data class ModelRow(
    val provider: ModelProvider,
    val id: String,
    val name: String,
    val favorite: Boolean,
    /** É a escolha atual: o mesmo provedor e o mesmo modelo. */
    val selected: Boolean,
)

fun isFavorite(
    favorites: List<ModelFavorite>,
    provider: ModelProvider,
    model: String,
): Boolean = favorites.any { it.provider == provider && it.model == model }

/** Guarda ou tira o favorito. O novo vai para o fim: a aba mostra na ordem em que foram guardados. */
fun toggleFavorite(
    favorites: List<ModelFavorite>,
    provider: ModelProvider,
    model: String,
): List<ModelFavorite> =
    if (isFavorite(favorites, provider, model)) {
        favorites.filterNot { it.provider == provider && it.model == model }
    } else {
        favorites + ModelFavorite(provider, model)
    }

/**
 * As linhas da aba. Nos favoritos, os guardados que o servidor ainda oferece, na ordem em que foram guardados; num provedor, os
 * modelos dele na ordem do servidor. A busca vale dentro da aba.
 */
fun modelRows(
    options: ModelOptions,
    favorites: List<ModelFavorite>,
    selection: ModelSelection,
    tab: ModelTab,
    query: String,
): List<ModelRow> {
    val offered: List<Triple<ModelProvider, String, String>> =
        when (tab) {
            ModelTab.Favorites ->
                favorites.mapNotNull { entry ->
                    options.providerOf(entry.provider)?.models?.firstOrNull { it.id == entry.model }?.let {
                        Triple(entry.provider, it.id, it.name)
                    }
                }
            is ModelTab.OfProvider ->
                options
                    .providerOf(tab.id)
                    ?.models
                    .orEmpty()
                    .map { Triple(tab.id, it.id, it.name) }
        }
    val words = searchWords(query)
    val kept = offered.filter { (_, id, name) -> matchesWords(words, name, id) }
    return kept.map { (provider, id, name) ->
        ModelRow(
            provider = provider,
            id = id,
            name = name,
            favorite = isFavorite(favorites, provider, id),
            selected = provider == selection.provider && id == selection.model,
        )
    }
}
