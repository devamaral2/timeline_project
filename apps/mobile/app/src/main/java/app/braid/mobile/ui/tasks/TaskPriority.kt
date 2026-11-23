package app.braid.mobile.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.task.TaskPriority

/** As quatro barras do indicador (viewBox 20×16 do web, deslocadas 2 para baixo para caber centradas na grade de 20): x e topo. */
private val PRIORITY_BARS = listOf(3f to 10f, 8f to 7.5f, 13f to 5f, 18f to 2.5f)
private const val PRIORITY_GRID = 20f
private const val PRIORITY_STROKE = 2.5f
private const val UNLIT_ALPHA = 0.25f
private const val BAR_BOTTOM = 13f
private const val GRID_OFFSET = 2f

private fun litBars(priority: TaskPriority): Int =
    when (priority) {
        TaskPriority.Urgent -> 4
        TaskPriority.High -> 3
        TaskPriority.Medium -> 2
        TaskPriority.Low -> 1
    }

/** A cor da prioridade, a do `--priority-*` do web: urgente é o destrutivo, alta o âmbar, média o texto e baixa o apagado. */
@Composable
private fun priorityColor(priority: TaskPriority): Color =
    when (priority) {
        TaskPriority.Urgent -> MaterialTheme.colorScheme.error
        TaskPriority.High -> braidTokens().warning
        TaskPriority.Medium -> MaterialTheme.colorScheme.onBackground
        TaskPriority.Low -> MaterialTheme.colorScheme.onSurfaceVariant
    }

/** O indicador de prioridade: quatro barras, e quantas acendem dizem o nível; as apagadas ficam no lugar. */
@Composable
fun TaskPriorityMark(
    priority: TaskPriority,
    modifier: Modifier = Modifier,
) {
    val color = priorityColor(priority)
    val lit = litBars(priority)
    val parts =
        remember(priority, color) {
            PRIORITY_BARS.mapIndexed { index, (x, top) ->
                SvgPart(
                    pathData = "M$x ${BAR_BOTTOM + GRID_OFFSET}V${top + GRID_OFFSET}",
                    color = if (index < lit) color else color.copy(alpha = UNLIT_ALPHA),
                )
            }
        }
    SvgIcon(
        parts = parts,
        size = 18.dp,
        color = color,
        strokeWidth = PRIORITY_STROKE,
        grid = PRIORITY_GRID,
        modifier = modifier.clearAndSetSemantics { contentDescription = "Prioridade: ${priority.label}" },
    )
}

/** A escolha das quatro prioridades, numa folha inferior (no web, a lista sob o botão): a atual marcada. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskPrioritySheet(
    taskName: String,
    current: TaskPriority,
    onPick: (TaskPriority) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier.semantics { contentDescription = "Prioridade de “$taskName”" },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(start = 12.dp, end = 12.dp, bottom = 16.dp),
        ) {
            TaskPriority.entries.forEach { priority ->
                PriorityOption(priority = priority, selected = priority == current, onClick = { onPick(priority) })
            }
        }
    }
}

@Composable
private fun PriorityOption(
    priority: TaskPriority,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp)
                .semantics(mergeDescendants = true) { this.selected = selected }
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) { TaskPriorityMark(priority) }
        Spacer(Modifier.width(10.dp))
        Text(
            text = priority.label,
            modifier = Modifier.weight(1f),
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        if (selected) {
            SvgIcon(
                BraidIcons.check,
                size = 16.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                strokeWidth = 1.75f,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}
