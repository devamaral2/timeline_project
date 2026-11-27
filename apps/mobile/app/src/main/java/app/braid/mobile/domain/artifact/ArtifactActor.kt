package app.braid.mobile.domain.artifact

import app.braid.mobile.domain.task.TaskActor

/** O tipo do artefato do contrato; [code] é o nome que a API usa. */
enum class ArtifactType(
    val code: String,
) {
    Text("text"),
    News("news"),
    EmailSummary("email_summary"),
    YoutubeTranscript("youtube_transcript"),
    Food("food"),
    Sleep("sleep"),
    Training("training"),
    Workout("workout"),
    Skill("skill"),
    Agent("agent"),
    Router("router"),

    /**
     * Um tipo que este app não conhece (de uma versão mais nova do contrato). Não está no contrato: [known] o deixa de
     * fora, e o artefato aparece como texto genérico, sem edição nem comportamento próprio do tipo.
     */
    Unknown("unknown"),
    ;

    companion object {
        /** Os tipos do contrato, na ordem dele: o que as fixtures geradas do web conferem e o que um filtro de tipo oferece. */
        val known: List<ArtifactType> = entries.filter { it != Unknown }

        /** Um código que o app não conhece vira [Unknown], em vez de derrubar a lista, a busca, o detalhe ou a tarefa. */
        fun fromCode(code: String): ArtifactType = known.firstOrNull { it.code == code } ?: Unknown
    }
}

/**
 * Os tipos de texto livre: o que a pessoa lê e edita como uma nota (o corpo em markdown é o dado): o texto, as notícias,
 * o resumo de e-mail e a transcrição. Espelha `FREE_TEXT_ARTIFACT_TYPES` do web.
 */
val FREE_TEXT_ARTIFACT_TYPES: Set<ArtifactType> =
    setOf(ArtifactType.Text, ArtifactType.News, ArtifactType.EmailSummary, ArtifactType.YoutubeTranscript)

/**
 * Os tipos cujo dado é `{ body }` em markdown: os de texto livre e o roteador, que segue um arquivo do agente e por
 * isso não se edita como nota. Espelha `TEXT_BODY_ARTIFACT_TYPES` do web.
 */
val TEXT_BODY_ARTIFACT_TYPES: Set<ArtifactType> = FREE_TEXT_ARTIFACT_TYPES + ArtifactType.Router

/**
 * O tipo desconhecido mostra o texto quando o dado traz um `body`, mesmo sem ser de nenhum grupo acima: a pessoa lê o
 * que a versão mais nova do app guardou, e nada mais (não edita, não pede edição por IA).
 */
val ArtifactType.showsBody: Boolean get() = hasTextBody || this == ArtifactType.Unknown

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
