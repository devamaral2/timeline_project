package app.braid.mobile.domain.artifact

/** O que a lista pede à API. Tudo ausente traz todos os documentos do usuário. */
data class ArtifactFilters(
    val type: ArtifactType? = null,
    /** O catálogo global do [type] (os seletores de alimento e exercício da edição), em vez dos documentos do usuário. */
    val global: Boolean = false,
    val tag: String? = null,
    /** O texto da busca; em branco não filtra. */
    val query: String? = null,
)

interface ArtifactRepository {
    /** Os documentos que combinam com [filters], do mais recente para o mais antigo (a ordem é a da API). */
    suspend fun list(filters: ArtifactFilters = ArtifactFilters()): List<Artifact>

    /** O documento com todas as tarefas em que aparece. Inexistente ou de outro dono sobe como [ArtifactNotFoundException]. */
    suspend fun get(id: String): Artifact

    /** Cria o documento e devolve o id. [idempotencyKey] é a chave do formulário: repetir a mesma não cria outro. */
    suspend fun create(
        draft: ArtifactDraft,
        idempotencyKey: String,
    ): String

    /**
     * Grava o conteúdo inteiro do documento de texto com a [revision] que a tela leu. Revisão velha (409) sobe como
     * [app.braid.mobile.domain.task.StaleRevisionException]; qualquer outra falha sobe como exceção.
     */
    suspend fun updateText(
        id: String,
        revision: Int,
        text: TextContent,
    )

    /** Exclui o documento. */
    suspend fun delete(id: String)
}

/** O que a pessoa escreve num documento de texto: [name] ausente deixa a API escolher o nome. */
data class TextContent(
    val name: String?,
    val tags: List<String>,
    val body: String,
)

/** Um documento novo: o texto livre ou o alimento, que o agente calcula depois (o `inputText` do contrato). */
sealed interface ArtifactDraft {
    data class Text(
        val content: TextContent,
    ) : ArtifactDraft

    data class Meal(
        val description: String,
    ) : ArtifactDraft
}

/** A API responde 404 para o documento que não existe e 403 para o de outro usuário: a tela diz só que não há documento. */
class ArtifactNotFoundException(
    cause: Throwable? = null,
) : Exception("Documento não encontrado.", cause)
