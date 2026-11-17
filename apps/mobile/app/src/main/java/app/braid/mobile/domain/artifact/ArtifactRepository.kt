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
}

/** A API responde 404 para o documento que não existe e 403 para o de outro usuário: a tela diz só que não há documento. */
class ArtifactNotFoundException(
    cause: Throwable? = null,
) : Exception("Documento não encontrado.", cause)
