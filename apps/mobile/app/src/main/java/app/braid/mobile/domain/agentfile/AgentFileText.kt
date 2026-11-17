package app.braid.mobile.domain.agentfile

import app.braid.mobile.domain.artifact.MONTHS_ABBREVIATED
import app.braid.mobile.domain.artifact.formatDecimal
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.formatTime
import java.time.Instant

/*
 * Os textos da vista do arquivo do agente, portados de `AgentFileNoteView.tsx` (cabeçalho `---`) e
 * `AgentFileBackups.tsx` (data e tamanho). Cada saída é conferida contra as fixtures geradas pelo web
 * (`AgentFileTextTest`).
 */

private val FRONTMATTER = Regex("""^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|\z)""")
private val SUMMARY_LINE = Regex("""^([\w.-]+):(?:\s+(.*))?\z""")
private val LINE_BREAK = Regex("""\r?\n""")

/** Uma linha do sumário: `chave:` em destaque e o valor; sem `chave:`, [key] é `null` e a linha vai crua. */
data class SummaryLine(
    val key: String?,
    val value: String?,
    val line: String,
)

/** O texto do arquivo separado em sumário (o cabeçalho `---` YAML das skills e agentes) e corpo em markdown. */
data class FileText(
    val summary: List<SummaryLine>,
    val body: String,
)

fun splitFrontmatter(text: String): FileText {
    val match = FRONTMATTER.find(text) ?: return FileText(emptyList(), text)
    val lines = match.groupValues[1].split(LINE_BREAK).filter { it.isNotBlank() }
    return FileText(lines.map(::summaryLine), text.substring(match.value.length))
}

private fun summaryLine(line: String): SummaryLine {
    val split = SUMMARY_LINE.find(line) ?: return SummaryLine(null, null, line)
    return SummaryLine(split.groupValues[1], split.groups[2]?.value, line)
}

/** A versão que o cabeçalho mostra: os oito primeiros caracteres do hash. */
fun fileVersion(hash: String): String = hash.take(VERSION_LENGTH)

private const val VERSION_LENGTH = 8
private const val BYTES_PER_KIB = 1024.0

/** "512 B", "1,5 KB" ou "2,6 MB": uma casa decimal no máximo, vírgula decimal. */
fun backupSizeLabel(bytes: Long): String {
    if (bytes < BYTES_PER_KIB) return "$bytes B"
    if (bytes < BYTES_PER_KIB * BYTES_PER_KIB) return "${formatDecimal(bytes / BYTES_PER_KIB)} KB"
    return "${formatDecimal(bytes / (BYTES_PER_KIB * BYTES_PER_KIB))} MB"
}

/** "14 de set. de 2026, 09:30", na hora de São Paulo e com o ano sempre. */
fun backupWhenLabel(instant: Instant): String {
    val (year, month, day) = dayKeyOf(instant).split("-").map(String::toInt)
    return "$day de ${MONTHS_ABBREVIATED[month - 1]} de $year, ${formatTime(instant)}"
}
