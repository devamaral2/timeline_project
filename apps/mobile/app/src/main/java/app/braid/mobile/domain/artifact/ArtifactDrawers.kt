package app.braid.mobile.domain.artifact

import app.braid.mobile.domain.task.TaskStatus
import java.time.Instant
import kotlin.math.floor

/*
 * As gavetas da lista de Artefatos, uma por tipo, e o que a linha de cada tipo mostra: o porte linha a linha de
 * `lib/artifacts/artifact-drawers.ts`, conferido contra a fixture `documents-drawers`.
 */

/** [type] [ArtifactType.Unknown] é a gaveta "Outros": o artefato de um tipo que este app não conhece não some da lista. */
data class ArtifactDrawer(
    val type: ArtifactType,
    val title: String,
    /** Na ordem recebida: a da API, do mais recente para o mais antigo. */
    val artifacts: List<Artifact>,
)

private fun artifactDrawerTitle(type: ArtifactType): String =
    when (type) {
        ArtifactType.Text -> "Notas"
        ArtifactType.News -> "Notícias"
        ArtifactType.EmailSummary -> "Resumos de e-mail"
        ArtifactType.YoutubeTranscript -> "Transcrições"
        ArtifactType.Food -> "Refeições"
        ArtifactType.Sleep -> "Sono"
        ArtifactType.Training -> "Treinos"
        ArtifactType.Workout -> "Exercícios"
        ArtifactType.Skill -> "Skills"
        ArtifactType.Agent -> "Agentes"
        ArtifactType.Router -> "Roteadores"
        ArtifactType.Unknown -> "Outros"
    }

/** As gavetas com algum artefato, na ordem do contrato e, por último, a dos tipos desconhecidos. */
fun artifactDrawersOf(artifacts: List<Artifact>): List<ArtifactDrawer> =
    (ArtifactType.known + ArtifactType.Unknown).mapNotNull { type ->
        artifacts
            .filter { it.type == type }
            .takeIf { it.isNotEmpty() }
            ?.let { ArtifactDrawer(type, artifactDrawerTitle(type), it) }
    }

/**
 * Se a gaveta começa aberta. Na lista inteira só Notas abre, para a primeira tela mostrar todos os tipos. Com filtro
 * o que foi pedido aparece sem outro toque, e a gaveta sozinha também abre.
 */
fun artifactDrawerStartsOpen(
    type: ArtifactType,
    drawerCount: Int,
    narrowed: Boolean,
): Boolean = narrowed || drawerCount == 1 || type == ArtifactType.Text

/** [Mono] é número ou código, [Fill] ocupa o que sobra e corta, [Alert] é um aviso. */
enum class ArtifactRowPartStyle(
    val code: String,
) {
    Mono("mono"),
    Fill("fill"),
    Alert("alert"),
}

/** Um trecho da linha de apoio. */
data class ArtifactRowPart(
    val text: String,
    val style: ArtifactRowPartStyle? = null,
)

data class ArtifactRowFacts(
    val support: List<ArtifactRowPart>,
    val tags: List<String>,
    /** O número do tipo na ponta direita: calorias da refeição, duração do treino. */
    val figure: String? = null,
    /** No lugar do número, enquanto o agente calcula a refeição ou quando o cálculo falhou. */
    val agentStatus: TaskStatus? = null,
)

const val MISSING_AGENT_FILE_LINE = "O arquivo não está mais na pasta."

/** "Hoje, 09:00", "Ontem, 21:12" ou "11 set., 09:00": o rótulo das telas de nota, com a inicial maiúscula. */
private fun updatedLabel(
    artifact: Artifact,
    now: Instant,
): String = whenLabel(artifact.updatedAt, now).replaceFirstChar { it.uppercaseChar() }

/** `Math.round` do JavaScript: a metade sobe. */
private fun roundHalfUp(value: Double): Double = floor(value + 0.5)

/** A linha de apoio, as tags e a ponta direita de um artefato na lista. */
fun artifactRowFacts(
    artifact: Artifact,
    now: Instant,
): ArtifactRowFacts {
    val updated = ArtifactRowPart(updatedLabel(artifact, now))
    val plain = ArtifactRowFacts(support = listOf(updated), tags = artifact.tags)
    return when (val data = artifact.data) {
        is FoodData -> foodFacts(plain, data)
        is SleepData -> {
            // O título do sono já é longo: a linha leva a duração e a pontuação no lugar da data.
            val slept =
                listOfNotNull(
                    data.trackedSleepTime
                        .takeIf { it > 0 }
                        ?.let { ArtifactRowPart(formatMinutes(it), ArtifactRowPartStyle.Mono) },
                )
            plain.copy(support = slept + ArtifactRowPart("Pontuação ${formatDecimal(data.score)}"))
        }
        is TrainingData -> {
            val names =
                data.workouts
                    .map { it.name }
                    .distinct()
                    .joinToString(", ")
            val minutes = data.workouts.sumOf { it.duration }
            plain.copy(
                support = if (names.isEmpty()) listOf(updated) else listOf(updated, ArtifactRowPart(names, ArtifactRowPartStyle.Fill)),
                figure = minutes.takeIf { it > 0 }?.let { formatMinutes(it) },
            )
        }
        is WorkoutCatalogData ->
            plain.copy(support = listOf(ArtifactRowPart(data.category.code, ArtifactRowPartStyle.Mono)), tags = emptyList())
        is AgentFileData -> agentFileFacts(plain, data, updated)
        is TextData, UnknownData -> plain
    }
}

private fun foodFacts(
    plain: ArtifactRowFacts,
    data: FoodData,
): ArtifactRowFacts =
    when (data.generation) {
        FoodGeneration.Pending -> plain.copy(agentStatus = TaskStatus.Running)
        FoodGeneration.Failed -> plain.copy(agentStatus = TaskStatus.Failed)
        else -> plain.copy(figure = roundHalfUp(data.totals.calories).takeIf { it > 0 }?.let { "${formatDecimal(it)} kcal" })
    }

private fun agentFileFacts(
    plain: ArtifactRowFacts,
    data: AgentFileData,
    updated: ArtifactRowPart,
): ArtifactRowFacts {
    if (data.missing) {
        return plain.copy(support = listOf(ArtifactRowPart(MISSING_AGENT_FILE_LINE, ArtifactRowPartStyle.Alert)), tags = emptyList())
    }
    val description = data.description?.trim().orEmpty()
    val line = if (description.isEmpty()) updated else ArtifactRowPart(description, ArtifactRowPartStyle.Fill)
    return plain.copy(support = listOf(line), tags = emptyList())
}
