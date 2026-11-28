package app.braid.mobile.ui.tasks

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.task.TASK_SITUATIONS
import app.braid.mobile.domain.task.TaskActor
import app.braid.mobile.domain.task.TaskSituation
import app.braid.mobile.domain.task.TaskStatus
import app.braid.mobile.domain.task.humanStatusOptions

/**
 * A escolha dos sete status de pessoa, numa folha inferior (no web, o cartão que o glifo abre): o rótulo e o glifo de
 * cada status, o atual marcado. Quem abre decide o que gravar com a escolha, inclusive quando é a opção que já está.
 * É a folha que as outras telas reaproveitam: a lista de tarefas e o detalhe.
 */
@Composable
fun TaskStatusSheet(
    taskName: String,
    longRunning: Boolean,
    current: TaskStatus?,
    onPick: (TaskStatus) -> Unit,
    onDismiss: () -> Unit,
) {
    ChoiceSheet(description = "Status de “$taskName”", onDismiss = onDismiss) {
        humanStatusOptions(longRunning).forEach { status ->
            ChoiceOption(name = taskStatusName(TaskActor.Human, status), selected = status == current, onClick = { onPick(status) }) {
                TaskStatusGlyph(actor = TaskActor.Human, status = status, size = 18.dp)
            }
        }
    }
}

/**
 * A escolha das três situações de um pedido de agente que terminou, na mesma folha do status de pessoa: o glifo e o
 * nome de cada uma, a atual marcada. Escolher qualquer uma, inclusive a atual, avisa quem usa, e qualquer situação
 * vale a partir de qualquer outra.
 */
@Composable
fun TaskSituationSheet(
    taskName: String,
    current: TaskSituation,
    onPick: (TaskSituation) -> Unit,
    onDismiss: () -> Unit,
) {
    ChoiceSheet(description = "Situação de “$taskName”", onDismiss = onDismiss) {
        TASK_SITUATIONS.forEach { situation ->
            ChoiceOption(name = situationName(situation), selected = situation == current, onClick = { onPick(situation) }) {
                TaskSituationGlyph(situation, size = 18.dp)
            }
        }
    }
}

/** A folha inferior das escolhas de uma tarefa: as opções em coluna, com rolagem. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChoiceSheet(
    description: String,
    onDismiss: () -> Unit,
    options: @Composable ColumnScope.() -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(
                    rememberScrollState(),
                ).navigationBarsPadding()
                .padding(start = 12.dp, end = 12.dp, bottom = 16.dp),
            content = options,
        )
    }
}

@Composable
private fun ChoiceOption(
    name: String,
    selected: Boolean,
    onClick: () -> Unit,
    glyph: @Composable () -> Unit,
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
        Box(Modifier.size(24.dp).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
            glyph()
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = name,
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
