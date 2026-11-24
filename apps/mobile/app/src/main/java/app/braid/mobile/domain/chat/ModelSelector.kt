package app.braid.mobile.domain.chat

import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelOffException
import app.braid.mobile.domain.request.ModelOptions
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.updateAndGet
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/** O que o seletor mostra: o que o servidor oferece, a escolha atual e os modelos favoritos (na ordem em que foram guardados). */
data class ModelPicker(
    val options: ModelOptions,
    val selection: ModelSelection,
    val favorites: List<ModelFavorite> = emptyList(),
)

/** O que o app sabe da escolha de modelo agora. */
data class ModelSelectorState(
    /** O que o servidor oferece; `null` antes da leitura, com o modo modelo desligado ou sem rede. */
    val options: ModelOptions? = null,
    /** A escolha conferida contra as opções e o último modelo de cada provedor; existe depois da primeira leitura. */
    val stored: StoredModelSelection? = null,
    /** Os modelos favoritos da folha, lidos do aparelho junto com as opções. */
    val favorites: List<ModelFavorite> = emptyList(),
) {
    val selection: ModelSelection? get() = stored?.current

    /** O seletor só existe com as opções lidas; sem ele o campo é o simples e o pedido vai sem modelo. */
    val picker: ModelPicker?
        get() {
            val current = selection
            return if (options != null && current != null) ModelPicker(options, current, favorites) else null
        }
}

/**
 * A escolha de provedor, modelo e esforço (ADR 0019), uma só para o app inteiro: o chat e a barra de edição dos detalhes
 * mostram a mesma, e a troca feita num vale no outro (o `model-selection-store` do web). Lê o que o servidor oferece,
 * confere a escolha guardada contra isso e grava cada troca no aparelho na hora.
 */
@Singleton
class ModelSelector
    @Inject
    constructor(
        private val repository: ChatRepository,
        private val store: ModelSelectionStore,
    ) {
        private val mutableState = MutableStateFlow(ModelSelectorState())
        val state: StateFlow<ModelSelectorState> = mutableState.asStateFlow()

        /** Uma leitura por vez: quem chega durante uma leitura espera por ela e fica com o resultado dela. */
        private val reading = Mutex()

        /** Quantas leituras já terminaram; é como quem esperou sabe que a leitura em curso acabou. */
        @Volatile
        private var finished = 0

        /**
         * Por que a última leitura falhou; `null` se deu certo. O modo desligado ([ModelOffException]) fica lembrado até
         * alguém perguntar de novo; uma falha de rede não: o próximo que precisar das opções tenta outra vez.
         */
        @Volatile
        private var failure: Exception? = null

        /**
         * Um campo de IA apareceu (o chat abriu, a barra de um detalhe entrou na tela): lê as opções de novo, por trás; até
         * a resposta vale o que já foi lido. Com o modo desligado (404) o seletor some; em outra falha fica o que havia.
         * Nunca sobe o erro: sem as opções o campo só fica sem o seletor.
         */
        suspend fun load() {
            try {
                read()
            } catch (_: ModelOffException) {
                // Sem provedor com chave: o campo fica simples.
            } catch (_: ChatRequestException) {
                // Rede ou servidor: vale o que já estava lido.
            }
        }

        /**
         * O seletor com as opções já lidas, ou lidas agora. Sem provedor com chave sobe [ModelOffException], e isso fica
         * lembrado: só [askAgain] (quem pede o modo modelo quer saber agora se ele existe) ou [load] perguntam de novo.
         */
        suspend fun picker(askAgain: Boolean = false): ModelPicker {
            mutableState.value.picker?.let { return it }
            val known = failure
            if (!askAgain && known is ModelOffException) throw ModelOffException(known)
            return read()
        }

        /**
         * A escolha que um pedido leva: a que o campo mostra. Lê as opções se ainda não leu (ou espera a leitura em curso);
         * sem o modo modelo, ou sem rede, é `null` e o pedido vai sem escolha, com o modelo do servidor.
         */
        suspend fun selectionForRequest(): ModelSelection? =
            try {
                picker().selection
            } catch (_: ModelOffException) {
                null
            } catch (_: ChatRequestException) {
                null
            }

        /** Lê as opções do servidor; quem chegou com uma leitura em curso fica com o que ela trouxe, sem abrir outra. */
        private suspend fun read(): ModelPicker {
            val seen = finished
            return reading.withLock {
                if (finished == seen) return@withLock fetch()
                failure?.let { throw it }
                mutableState.value.picker ?: fetch()
            }
        }

        private suspend fun fetch(): ModelPicker {
            val options =
                try {
                    repository.modelOptions()
                } catch (off: ModelOffException) {
                    // O modo saiu do ar: o seletor não mostra uma lista que o servidor já não oferece. A escolha fica.
                    mutableState.update { it.copy(options = null) }
                    finish(off)
                    throw off
                } catch (failed: ChatRequestException) {
                    finish(failed)
                    throw failed
                }
            val saved = mutableState.value.stored ?: store.read()
            // Já lida uma vez, a lista da memória vale: uma gravação em curso ainda não chegou ao aparelho.
            val favorites = if (mutableState.value.stored != null) mutableState.value.favorites else store.readFavorites()
            val next =
                mutableState.updateAndGet {
                    val kept = if (it.stored != null) it.favorites else favorites
                    ModelSelectorState(options, resolveSelection(options, it.stored ?: saved), kept)
                }
            val resolved = checkNotNull(next.stored)
            if (resolved != saved) persist(resolved)
            finish(null)
            return ModelPicker(options, resolved.current, next.favorites)
        }

        private fun finish(result: Exception?) {
            failure = result
            finished += 1
        }

        /** Troca o provedor: o modelo é o que ele tinha na última vez, ou o padrão dele. */
        suspend fun chooseProvider(provider: ModelProvider) = change { options, stored -> stored.withProvider(options, provider) }

        /**
         * Troca o modelo. Com [provider], troca os dois de uma vez (a escolha feita na aba dos favoritos ou de outro
         * provedor): o provedor novo retoma o modelo que tinha e logo o escolhido o substitui. Um modelo que o provedor não
         * oferece não muda nada.
         */
        suspend fun chooseModel(
            model: String,
            provider: ModelProvider? = null,
        ) = change { options, stored ->
            val target = provider ?: stored.current.provider
            val offered = options.providerOf(target)?.models?.any { it.id == model } == true
            when {
                !offered -> stored
                target == stored.current.provider -> stored.withModel(model)
                else -> stored.withProvider(options, target).withModel(model)
            }
        }

        /** Guarda ou tira um modelo dos favoritos da folha; a lista fica no aparelho, na ordem em que foi guardada. */
        suspend fun toggleFavorite(
            provider: ModelProvider,
            model: String,
        ) {
            mutableState.update { it.copy(favorites = toggleFavorite(it.favorites, provider, model)) }
            // Sair da tela no meio da gravação não a interrompe; grava a lista de agora, não a desta chamada.
            withContext(NonCancellable) { store.writeFavorites(mutableState.value.favorites) }
        }

        suspend fun chooseEffort(effort: ModelEffort) = change { _, stored -> stored.withEffort(effort) }

        /** A troca vale já em todas as telas e fica no aparelho. Sem as opções lidas não há o que trocar. */
        private suspend fun change(choose: (ModelOptions, StoredModelSelection) -> StoredModelSelection) {
            var changed: StoredModelSelection? = null
            mutableState.update { current ->
                val options = current.options ?: return
                val stored = current.stored ?: return
                val chosen = choose(options, stored)
                if (chosen == stored) return
                changed = chosen
                current.copy(stored = chosen)
            }
            changed?.let { persist(it) }
        }

        /** Sair da tela no meio da gravação não a interrompe. */
        private suspend fun persist(next: StoredModelSelection) = withContext(NonCancellable) { store.write(next) }
    }
