package app.braid.mobile.domain.task

import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.FoodData

/** A relação de um documento com a tarefa, como a API a guarda; a tela mostra o [code] como está. */
enum class ArtifactRelation(
    val code: String,
) {
    Creates("creates"),
    Updates("updates"),
    Uses("uses"),
    Deletes("deletes"),
    ;

    companion object {
        fun fromCode(code: String): ArtifactRelation =
            entries.firstOrNull { it.code == code } ?: error("Relação de documento desconhecida: $code")
    }
}

/** Um documento ligado à tarefa (`TaskArtifactDto`): a relação e o documento inteiro, na ordem em que a API o devolve. */
data class TaskArtifact(
    val relation: ArtifactRelation,
    /** O vínculo veio da série, e não de uma edição desta ocorrência. */
    val fromRecurrence: Boolean,
    val artifact: Artifact,
)

/**
 * Um documento na lista de edição da tarefa (`DraftArtifact` do web): o que a lista mostra e a relação. [id] de uma
 * cópia nova é só a chave da linha: a API não a recebe.
 */
data class DraftArtifact(
    val id: String,
    val name: String,
    val type: ArtifactType,
    val global: Boolean,
    val relation: ArtifactRelation,
    /** Cópia nova de um alimento: o id do original. Vai à API como `copyOf`, no lugar de `id` e `relation`. */
    val copyOf: String? = null,
    /** A quantidade do alimento como texto; só a cópia nova pode mudá-la. */
    val quantity: String? = null,
)

/** Uma entrada da lista de documentos do `PATCH`: um documento ligado (`id`, `relation`) ou uma cópia nova de alimento. */
sealed interface ArtifactLink {
    data class Linked(
        val id: String,
        val relation: ArtifactRelation,
    ) : ArtifactLink

    data class Copy(
        val copyOf: String,
        val quantity: String?,
    ) : ArtifactLink
}

/** Os documentos da tarefa lida, na ordem da API. Um alimento que já é cópia da tarefa mostra a quantidade que tem. */
fun draftArtifactsFromTask(links: List<TaskArtifact>): List<DraftArtifact> =
    links.map { link ->
        val artifact = link.artifact
        DraftArtifact(
            id = artifact.id,
            name = artifact.name,
            type = artifact.type,
            global = artifact.global,
            relation = link.relation,
            quantity = (artifact.data as? FoodData)?.quantity?.takeIf { it.isNotEmpty() },
        )
    }

/** O documento escolhido na busca entra no fim da lista, com a relação `uses`. Se já está na lista, nada muda. */
fun addDraftArtifact(
    list: List<DraftArtifact>,
    artifact: Artifact,
): List<DraftArtifact> {
    if (list.any { it.id == artifact.id }) return list
    return list + DraftArtifact(artifact.id, artifact.name, artifact.type, artifact.global, ArtifactRelation.Uses)
}

/**
 * O alimento escolhido entra no fim como cópia nova: [key] é a chave da linha (não vai à API) e a cópia leva o id do
 * original. Escolher o mesmo alimento de novo acrescenta outra cópia, com a sua quantidade.
 */
fun addFoodCopy(
    list: List<DraftArtifact>,
    food: Artifact,
    key: String,
): List<DraftArtifact> = list + DraftArtifact(key, food.name, food.type, food.global, ArtifactRelation.Uses, copyOf = food.id)

/** Muda a quantidade de uma cópia nova. Os alimentos que já estão na tarefa não mudam aqui. */
fun setCopyQuantity(
    list: List<DraftArtifact>,
    key: String,
    quantity: String,
): List<DraftArtifact> = list.map { if (it.id == key && it.copyOf != null) it.copy(quantity = quantity) else it }

/** Tira a ligação da lista; o documento em si não é apagado. */
fun removeDraftArtifact(
    list: List<DraftArtifact>,
    id: String,
): List<DraftArtifact> = list.filter { it.id != id }

/**
 * Sobe (`-1`) ou desce (`1`) um documento trocando com o vizinho que tem posição. O que a tarefa criou (`creates`) fica
 * na lista sem número e não se move; os de posição pulam por cima dele.
 */
fun moveDraftArtifact(
    list: List<DraftArtifact>,
    id: String,
    step: Int,
): List<DraftArtifact> {
    val index = list.indexOfFirst { it.id == id }
    val current = list.getOrNull(index)
    if (current == null || current.relation == ArtifactRelation.Creates) return list
    val positioned = list.indices.filter { list[it].relation != ArtifactRelation.Creates }
    val target = positioned.getOrNull(positioned.indexOf(index) + step) ?: return list
    val next = list.toMutableList()
    next[index] = list[target]
    next[target] = current
    return next
}

/** O número de cada linha: 1, 2, … para os de posição; `null` para o que a tarefa criou. */
fun draftArtifactPositions(list: List<DraftArtifact>): List<Int?> = artifactPositions(list.map { it.relation })

/** A posição de cada documento pela relação: 1, 2, … para os de posição, `null` para o que a tarefa criou. */
fun artifactPositions(relations: List<ArtifactRelation>): List<Int?> {
    var next = 0
    return relations.map { if (it == ArtifactRelation.Creates) null else ++next }
}

/**
 * A lista como o `PATCH` da tarefa a manda: a ordem da tela. Um documento ligado vai com id e relação; uma cópia nova
 * vai com `copyOf` e a quantidade, se houver (sem espaços nas pontas), sem relação.
 */
fun artifactLinkInputs(list: List<DraftArtifact>): List<ArtifactLink> =
    list.map { item ->
        if (item.copyOf == null) {
            ArtifactLink.Linked(item.id, item.relation)
        } else {
            ArtifactLink.Copy(item.copyOf, item.quantity?.trim()?.takeIf { it.isNotEmpty() })
        }
    }

/** Os mesmos documentos, na mesma ordem, com as mesmas relações, cópias e quantidades. */
fun sameArtifactLinks(
    a: List<DraftArtifact>,
    b: List<DraftArtifact>,
): Boolean =
    a.size == b.size &&
        a.indices.all { i ->
            a[i].id == b[i].id && a[i].relation == b[i].relation && a[i].copyOf == b[i].copyOf && a[i].quantity == b[i].quantity
        }

/** Na refeição o alimento escolhido entra como cópia (com a [key] da linha); nos outros tipos, por referência. */
fun draftWithPickedArtifact(
    list: List<DraftArtifact>,
    kind: TaskKind,
    artifact: Artifact,
    key: String,
): List<DraftArtifact> = if (kind == TaskKind.Meal) addFoodCopy(list, artifact, key) else addDraftArtifact(list, artifact)

/** Quantos documentos o seletor pede de cada vez. */
const val ARTIFACT_CHOICE_LIMIT = 50

/**
 * O que o "+" da seção oferece, conforme o tipo da tarefa (`artifactSource` do web): alimentos na refeição, exercícios
 * no treino, os documentos do usuário nos outros. [filters] são as consultas da busca; a refeição faz duas (o catálogo
 * global e depois os próprios) e as lista nessa ordem.
 */
enum class ArtifactSource(
    val title: String,
    val addLabel: String,
    val searchLabel: String,
    val failedMessage: String,
) {
    Meal(
        "Alimentos",
        "Adicionar alimento à refeição",
        "Buscar alimento para a refeição",
        "Não foi possível buscar alimentos. Tente de novo.",
    ),
    Training(
        "Exercícios",
        "Adicionar exercício ao treino",
        "Buscar exercício para o treino",
        "Não foi possível buscar exercícios. Tente de novo.",
    ),
    Other("Documentos", "Adicionar documento", "Buscar documento para ligar", "Não foi possível buscar documentos. Tente de novo."),
    ;

    /** As consultas de [query] (já sem espaços nas pontas; vazio traz os primeiros). */
    fun filters(query: String): List<ArtifactFilters> {
        val text = query.takeIf { it.isNotEmpty() }
        return when (this) {
            Meal ->
                listOf(
                    ArtifactFilters(type = ArtifactType.Food, global = true, query = text, limit = ARTIFACT_CHOICE_LIMIT),
                    ArtifactFilters(type = ArtifactType.Food, query = text, limit = ARTIFACT_CHOICE_LIMIT),
                )
            Training -> listOf(ArtifactFilters(type = ArtifactType.Workout, global = true, query = text, limit = ARTIFACT_CHOICE_LIMIT))
            Other -> listOf(ArtifactFilters(query = text, limit = ARTIFACT_CHOICE_LIMIT))
        }
    }

    /** Na refeição o mesmo alimento pode entrar de novo (como outra cópia); nos outros tipos o que já está ligado fica de fora. */
    val hidesLinked: Boolean get() = this != Meal

    companion object {
        fun of(kind: TaskKind): ArtifactSource =
            when (kind) {
                TaskKind.Meal -> Meal
                TaskKind.Training -> Training
                else -> Other
            }
    }
}

/** O total de calorias de uma refeição: os alimentos ligados somados, as cópias incluídas; o que não é alimento não entra. */
fun mealCaloriesKcal(links: List<TaskArtifact>): Double = links.sumOf { (it.artifact.data as? FoodData)?.totals?.calories ?: 0.0 }
