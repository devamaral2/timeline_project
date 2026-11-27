package app.braid.mobile.domain.artifact

import java.time.Duration
import java.time.Instant

/** O rótulo do tipo na tela: o texto é "Nota", o alimento "Refeição". */
fun artifactTypeLabel(type: ArtifactType): String =
    when (type) {
        ArtifactType.Text -> "Nota"
        ArtifactType.Food -> "Refeição"
        ArtifactType.Sleep -> "Sono"
        ArtifactType.Training -> "Treino"
        ArtifactType.Workout -> "Exercício"
        ArtifactType.Skill -> "Skill"
        ArtifactType.Agent -> "Agente"
        ArtifactType.Router -> "Roteador"
    }

/**
 * O tipo que escolhe o ícone da folha: a refeição usa o da tarefa de refeição (`meal`), o treino e o sono os das
 * tarefas de mesmo nome. O exercício tem desenho próprio, diferente do treino.
 */
fun artifactVisualType(type: ArtifactType): String =
    when (type) {
        ArtifactType.Food -> "meal"
        else -> type.code
    }

/** "3 artefatos": a legenda no topo da lista. */
fun artifactCountLabel(count: Int): String =
    when (count) {
        0 -> "Nenhum artefato"
        1 -> "1 artefato"
        else -> "$count artefatos"
    }

private val HEADING_MARKER = Regex("^\\s*#{1,6}\\s+")

/**
 * O corpo em markdown de um artefato de texto ou roteador, sem o título repetido na primeira linha
 * (a tela já o mostra). Os outros tipos não têm markdown: vazio.
 */
fun markdownBodyOf(artifact: Artifact): String {
    val body = (artifact.data as? TextData)?.body ?: return ""
    if (artifact.type != ArtifactType.Text && artifact.type != ArtifactType.Router) return ""
    val lines = body.split(Regex("\r?\n")).toMutableList()
    val firstIndex = lines.indexOfFirst { it.isNotBlank() }
    if (firstIndex >= 0 && lines[firstIndex].trim().replace(HEADING_MARKER, "") == artifact.name) {
        repeat(firstIndex + 1) { lines.removeAt(0) }
    }
    return lines.joinToString("\n").trim()
}

/** A noite de uma nota de sono: o título é o dia (ou os dois dias) da tarefa e, com fim planejado, quanto ela durou na agenda. */
data class SleepAgenda(
    val title: String,
    val agendaMinutes: Int?,
)

fun sleepAgendaOfArtifact(tasks: List<ArtifactTaskLink>): SleepAgenda? {
    val task = tasks.firstOrNull { it.startedAt != null } ?: return null
    val start = task.startedAt ?: return null
    val finish: Instant? = task.estimatedFinishAt
    return SleepAgenda(
        title = dateLineOf(start, finish),
        agendaMinutes = finish?.let { minutesBetween(start, it) },
    )
}

internal fun minutesBetween(
    from: Instant,
    to: Instant,
): Int =
    Duration
        .between(from, to)
        .toMillis()
        .let { Math.round(it / MILLIS_PER_MINUTE).toInt() }
        .coerceAtLeast(0)

private const val MILLIS_PER_MINUTE = 60_000.0
