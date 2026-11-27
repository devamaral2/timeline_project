package app.braid.mobile.ui.taskartifacts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.task.ArtifactRelation
import app.braid.mobile.domain.task.ArtifactSource
import app.braid.mobile.domain.task.DraftArtifact
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.draftArtifactPositions
import app.braid.mobile.domain.task.moveDraftArtifact
import app.braid.mobile.domain.task.sameArtifactLinks
import app.braid.mobile.ui.taskdetail.Section
import app.braid.mobile.ui.taskedit.AddButton
import app.braid.mobile.ui.taskedit.FormField

/** O que a seção Artefatos do formulário pede ao [app.braid.mobile.ui.taskedit.TaskEditViewModel]. */
class ArtifactEditActions(
    val picker: TaskArtifactPicker,
    val open: () -> Unit,
    val setQuantity: (key: String, quantity: String) -> Unit,
    val remove: (id: String) -> Unit,
    val move: (id: String, step: Int) -> Unit,
)

const val NO_DOCUMENTS_LABEL = "nenhum artefato"
const val NO_POSITION_LABEL = "sem posição na lista"

/**
 * "Artefatos" na edição: a lista da tarefa, na ordem da tela. Cada linha tem a posição, o nome, o tipo, de quem é e a
 * relação, e os botões Subir, Descer e Remover (não há arrastar). O "+" abre a folha de seleção, e o que ela oferece
 * depende do tipo da tarefa. Nada vai à API aqui: a lista segue no rascunho até o Salvar.
 */
@Composable
internal fun TaskEditArtifactsSection(
    draft: TaskDraft,
    actions: ArtifactEditActions,
) {
    val list = draft.artifacts
    val positions = draftArtifactPositions(list)
    Section("Artefatos", list.size.toString()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            list.forEachIndexed { index, item ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                androidx.compose.runtime.key(item.id) { EditRow(item, list, positions[index], actions) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                AddButton(ArtifactSource.of(draft.kind).addLabel, actions.open)
                if (list.isEmpty()) Muted(NO_DOCUMENTS_LABEL)
            }
        }
    }
    val picker by actions.picker.state.collectAsStateWithLifecycle()
    picker?.let { open ->
        ArtifactPickerSheet(open, onType = actions.picker::type, onPick = actions.picker::pick, onClose = actions.picker::close)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EditRow(
    item: DraftArtifact,
    list: List<DraftArtifact>,
    position: Int?,
    actions: ArtifactEditActions,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            position?.toString() ?: "—",
            Modifier.width(24.dp).padding(top = 2.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 20.sp,
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                item.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Code(item.type.code)
                Muted(if (item.global) GLOBAL_CATALOG_LABEL else OWN_DOCUMENT_LABEL)
                Code(item.relation.code)
                // A quantidade de um alimento que já está na tarefa só se lê; a cópia nova tem o campo.
                if (item.copyOf == null && item.quantity != null) Muted(item.quantity)
                if (position == null) Muted(NO_POSITION_LABEL)
            }
            if (item.copyOf != null) {
                FormField(
                    value = item.quantity.orEmpty(),
                    onChange = { actions.setQuantity(item.id, it) },
                    label = "Quantidade de “${item.name}”",
                    placeholder = "Quantidade",
                    singleLine = true,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (item.relation != ArtifactRelation.Creates) {
                    StepButton(
                        BraidIcons.chevronUp,
                        "Subir “${item.name}”",
                        enabled = !sameArtifactLinks(moveDraftArtifact(list, item.id, -1), list),
                    ) {
                        actions.move(item.id, -1)
                    }
                    StepButton(
                        BraidIcons.chevronDown,
                        "Descer “${item.name}”",
                        enabled = !sameArtifactLinks(moveDraftArtifact(list, item.id, 1), list),
                    ) {
                        actions.move(item.id, 1)
                    }
                }
                StepButton(BraidIcons.close, "Remover artefato “${item.name}”", enabled = true) { actions.remove(item.id) }
            }
        }
    }
}

/** Subir, descer ou remover. Desligado no começo e no fim da lista: não há para onde ir. */
@Composable
private fun StepButton(
    icon: List<app.braid.mobile.core.designsystem.SvgPart>,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(48.dp)
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = label
                if (!enabled) disabled()
            },
        contentAlignment = Alignment.Center,
    ) {
        SvgIcon(icon, size = 18.dp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.clearAndSetSemantics {})
    }
}

private const val DISABLED_ALPHA = 0.4f
