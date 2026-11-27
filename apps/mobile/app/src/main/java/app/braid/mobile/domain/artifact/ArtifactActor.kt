package app.braid.mobile.domain.artifact

import app.braid.mobile.domain.task.TaskActor

/** O tipo do artefato do contrato; [code] é o nome que a API usa. */
enum class ArtifactType(
    val code: String,
) {
    Text("text"),
    Food("food"),
    Sleep("sleep"),
    Training("training"),
    Workout("workout"),
    Skill("skill"),
    Agent("agent"),
    Router("router"),
    ;

    companion object {
        fun fromCode(code: String): ArtifactType = entries.firstOrNull { it.code == code } ?: error("Tipo de artefato desconhecido: $code")
    }
}

/**
 * Os tipos de texto livre: o que a pessoa lê e edita como uma nota (o corpo em markdown é o dado). Hoje só o texto; um
 * tipo novo de texto livre entra aqui e nos demais lugares nada muda. Espelha `FREE_TEXT_ARTIFACT_TYPES` do web.
 */
val FREE_TEXT_ARTIFACT_TYPES: Set<ArtifactType> = setOf(ArtifactType.Text)

/**
 * Os tipos cujo dado é `{ body }` em markdown: os de texto livre e o roteador, que segue um arquivo do agente e por
 * isso não se edita como nota. Espelha `TEXT_BODY_ARTIFACT_TYPES` do web.
 */
val TEXT_BODY_ARTIFACT_TYPES: Set<ArtifactType> = FREE_TEXT_ARTIFACT_TYPES + ArtifactType.Router

/** Lido e editado como uma nota: dono do texto, botão e tela de edição, alvo da edição por IA. */
val ArtifactType.isFreeText: Boolean get() = this in FREE_TEXT_ARTIFACT_TYPES

/** Tem um corpo em markdown para mostrar, buscar e prever (texto livre e roteador). */
val ArtifactType.hasTextBody: Boolean get() = this in TEXT_BODY_ARTIFACT_TYPES

/**
 * De quem é o artefato, para as listas Todos, Você e Agentes: a API não tem filtro de
 * dono, então a lista de artefatos filtra aqui, como o web. Skill, agente e roteador são dos agentes.
 */
fun artifactActor(type: ArtifactType): TaskActor =
    when (type) {
        ArtifactType.Skill, ArtifactType.Agent, ArtifactType.Router -> TaskActor.Agent
        else -> TaskActor.Human
    }
