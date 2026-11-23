package app.braid.mobile.domain.artifact

import app.braid.mobile.domain.task.TaskActor

/** O tipo do documento do contrato; [code] é o nome que a API usa. */
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
        fun fromCode(code: String): ArtifactType = entries.firstOrNull { it.code == code } ?: error("Tipo de documento desconhecido: $code")
    }
}

/**
 * De quem é o documento, para as listas Todos, Você e Agentes: a API não tem filtro de
 * dono, então a lista de documentos filtra aqui, como o web. Skill, agente e roteador são dos agentes.
 */
fun artifactActor(type: ArtifactType): TaskActor =
    when (type) {
        ArtifactType.Skill, ArtifactType.Agent, ArtifactType.Router -> TaskActor.Agent
        else -> TaskActor.Human
    }
