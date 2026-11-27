package app.braid.mobile.domain.task

import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.TEXT_BODY_ARTIFACT_TYPES
import app.braid.mobile.domain.artifact.TextData

/** A relação de um artefato com a tarefa, como a API a guarda; a tela mostra o [code] como está. */
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
            entries.firstOrNull { it.code == code } ?: error("Relação de artefato desconhecida: $code")
    }
}

/** Um artefato ligado à tarefa (`TaskArtifactDto`): a relação e o artefato inteiro, na ordem em que a API o devolve. */
data class TaskArtifact(
    val relation: ArtifactRelation,
    /** O vínculo veio da série, e não de uma edição desta ocorrência. */
    val fromRecurrence: Boolean,
    val artifact: Artifact,
)

/**
 * Um artefato na lista de edição da tarefa (`DraftArtifact` do web): o que a lista mostra e a relação. [id] de uma
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

/** Uma entrada da lista de artefatos do `PATCH`: um artefato ligado (`id`, `relation`) ou uma cópia nova de alimento. */
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

/** Os artefatos da tarefa lida, na ordem da API. Um alimento que já é cópia da tarefa mostra a quantidade que tem. */
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

/** O artefato escolhido na busca entra no fim da lista, com a relação `uses`. Se já está na lista, nada muda. */
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

/** Tira a ligação da lista; o artefato em si não é apagado. */
fun removeDraftArtifact(
    list: List<DraftArtifact>,
    id: String,
): List<DraftArtifact> = list.filter { it.id != id }

/**
 * Sobe (`-1`) ou desce (`1`) um artefato trocando com o vizinho que tem posição. O que a tarefa criou (`creates`) fica
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

/** A posição de cada artefato pela relação: 1, 2, … para os de posição, `null` para o que a tarefa criou. */
fun artifactPositions(relations: List<ArtifactRelation>): List<Int?> {
    var next = 0
    return relations.map { if (it == ArtifactRelation.Creates) null else ++next }
}

/**
 * Os tipos cujo conteúdo aparece inteiro dentro da tarefa: o texto livre (nota, notícias, resumo de e-mail e transcrição),
 * o roteador, o alimento, o treino e o sono. Skill e agente ficam só no cabeçalho (o arquivo do Hermes tem leitura e edição
 * no detalhe do artefato), e o exercício do catálogo também.
 */
private val INLINE_TYPES = TEXT_BODY_ARTIFACT_TYPES + setOf(ArtifactType.Food, ArtifactType.Training, ArtifactType.Sleep)

/** O cartão do artefato na tarefa tem conteúdo embaixo da linha (que a seta recolhe)? Um tipo desconhecido, só se o dado traz um texto. */
fun hasInlineContent(artifact: Artifact): Boolean =
    artifact.type in INLINE_TYPES || (artifact.type == ArtifactType.Unknown && artifact.data is TextData)

/** A linha em mono do artefato na tarefa: `posição · código do tipo · relação` (`1 · news · uses`); o que a tarefa criou não tem posição. */
fun artifactMetaLine(
    position: Int?,
    link: TaskArtifact,
): String = listOfNotNull(position?.toString(), link.artifact.typeCode, link.relation.code).joinToString(" · ")

/**
 * A lista como o `PATCH` da tarefa a manda: a ordem da tela. Um artefato ligado vai com id e relação; uma cópia nova
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

/** Os mesmos artefatos, na mesma ordem, com as mesmas relações, cópias e quantidades. */
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

/** Quantos artefatos o seletor pede de cada vez. */
const val ARTIFACT_CHOICE_LIMIT = 50

/**
 * O que o "+" da seção oferece, conforme o tipo da tarefa (`artifactSource` do web): alimentos na refeição, exercícios
 * no treino, os artefatos do usuário nos outros. [filters] são as consultas da busca; a refeição faz duas (o catálogo
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
    Other("Artefatos", "Adicionar artefato", "Buscar artefato para ligar", "Não foi possível buscar artefatos. Tente de novo."),
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
