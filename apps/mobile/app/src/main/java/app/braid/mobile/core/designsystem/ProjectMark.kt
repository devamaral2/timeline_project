package app.braid.mobile.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.domain.project.Project
import java.util.Locale

/*
 * A marca do projeto de `packages/theme/src/project-mark.ts`: as iniciais sobre a cor dele. O matiz vem do nome pela
 * função das tags (`hueForTag`), com a luminosidade e o croma das tags do tema; o texto usa a cor do fundo da tela.
 * `personal` é neutro. Conferida contra o fixture `project-marks` (`ProjectMarkTest`).
 */

/** Espaço (inclusive o Unicode do JS) e os separadores de palavra do nome do projeto. */
private val WordSeparators = Regex("[\\s\\p{Z}\\uFEFF_\\-./]+")

/** A passagem de minúscula para maiúscula (`timelineProject`) também separa palavras. */
private val CaseBoundary = Regex("(?<=\\p{Ll})(?=\\p{Lu})")

private fun wordsOf(name: String): List<String> = name.replace(CaseBoundary, " ").split(WordSeparators).filter { it.isNotEmpty() }

/** Os primeiros [count] pontos de código de [text]; um emoji vale um, como o `Array.from` do web. */
private fun firstCodePoints(
    text: String,
    count: Int,
): String {
    var end = 0
    var taken = 0
    while (end < text.length && taken < count) {
        end += Character.charCount(text.codePointAt(end))
        taken += 1
    }
    return text.substring(0, end)
}

/**
 * As iniciais da marca, em maiúsculas: a inicial das duas primeiras palavras ou, com uma só, os dois primeiros
 * caracteres. `timeline_project` dá "TP", `agent-skills` dá "AS", `t3code` dá "T3" e `personal` dá "PE".
 */
fun projectInitials(name: String): String {
    val words = wordsOf(name)
    val letters =
        if (words.size >= 2) {
            words.take(2).joinToString("") { firstCodePoints(it, 1) }
        } else {
            firstCodePoints(words.firstOrNull().orEmpty(), 2)
        }
    return letters.uppercase(Locale.ROOT)
}

/** As cores da marca: [outline] só existe no `personal`, que ganha um fio de contorno. */
class ProjectMarkColors(
    val background: Color,
    val text: Color,
    val outline: Color?,
)

/** As cores da marca de [project] no tema escuro ([dark]) ou claro. */
internal fun projectMarkColors(
    project: Project,
    dark: Boolean,
): ProjectMarkColors {
    val background = if (dark) DarkTokens.background else LightTokens.background
    if (project.personal) {
        return if (dark) {
            ProjectMarkColors(DarkTokens.muted, DarkTokens.mutedForeground, DarkTokens.border)
        } else {
            ProjectMarkColors(LightTokens.muted, LightTokens.mutedForeground, LightTokens.border)
        }
    }
    val rgb =
        tagRgb(
            project.name,
            if (dark) DarkTokens.tagLightness else LightTokens.tagLightness,
            if (dark) DarkTokens.tagChroma else LightTokens.tagChroma,
        )
    return ProjectMarkColors(Color(0xFF000000.toInt() or rgb), background, null)
}

private val MarkShape = RoundedCornerShape(5.dp)

/**
 * A marca do projeto. [labelled] serve à marca sozinha, sem o nome ao lado: ela passa a ter o nome do projeto como
 * descrição para o leitor de tela; ao lado do nome, é decorativa.
 */
@Composable
fun ProjectMark(
    project: Project,
    modifier: Modifier = Modifier,
    labelled: Boolean = false,
) {
    val colors = projectMarkColors(project, LocalBraidDarkTheme.current)
    Box(
        modifier
            .defaultMinSize(minWidth = 20.dp)
            .height(18.dp)
            .background(colors.background, MarkShape)
            .then(colors.outline?.let { Modifier.border(BorderStroke(1.dp, it), MarkShape) } ?: Modifier)
            .padding(horizontal = 3.dp)
            .then(if (labelled) Modifier.semantics { contentDescription = project.name } else Modifier.clearAndSetSemantics {}),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = projectInitials(project.name),
            color = colors.text,
            fontFamily = BraidMonoFont,
            fontSize = 10.sp,
            lineHeight = 10.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.02.em,
            maxLines = 1,
        )
    }
}

/** A linha do projeto: a marca e o nome em mono. Os detalhes da tarefa e o formulário a usam; a linha da lista só leva a marca. */
@Composable
fun ProjectLine(
    project: Project,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.defaultMinSize(minHeight = 18.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ProjectMark(project)
        Text(
            text = project.name,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
