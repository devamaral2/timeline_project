package app.braid.mobile.ui.taskedit

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.task.HierarchySlot
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.cardWhenLabel
import app.braid.mobile.ui.chat.BotState
import app.braid.mobile.ui.chat.ChatIcons
import app.braid.mobile.ui.chat.HermesBotIcon
import app.braid.mobile.ui.picker.EntityPickerSheet
import app.braid.mobile.ui.taskdetail.Section
import app.braid.mobile.ui.tasks.TaskKindMark
import app.braid.mobile.ui.tasks.TaskStatusGlyph
import java.time.Instant

const val PARENT_LOAD_FAILED = "A tarefa principal não carregou."
const val SUBTASKS_LOAD_FAILED = "Algumas subtarefas não carregaram."
const val CREATE_HINT = "Escreva na busca o nome da tarefa nova ou o pedido ao Hermes."
private const val UNAVAILABLE_TASK = "Tarefa indisponível"
private const val LOADING_TASK = "Carregando…"

/** Os textos de um lado da hierarquia, os mesmos do web. */
private class SlotText(
    val title: String,
    val addLabel: String,
    val searchLabel: String,
    val emptyLabel: String,
    val loadFailed: String,
    val removeLabel: (String) -> String,
)

private val ParentText =
    SlotText(
        title = "Tarefa principal",
        addLabel = "Escolher a tarefa principal",
        searchLabel = "Buscar tarefa principal",
        emptyLabel = "nenhuma tarefa principal",
        loadFailed = PARENT_LOAD_FAILED,
        removeLabel = { "Tirar “$it” como tarefa principal" },
    )

private val SubtasksText =
    SlotText(
        title = "Subtarefas",
        addLabel = "Adicionar subtarefa",
        searchLabel = "Buscar subtarefa",
        emptyLabel = "nenhuma subtarefa",
        loadFailed = SUBTASKS_LOAD_FAILED,
        removeLabel = { "Remover a subtarefa “$it”" },
    )

/**
 * A hierarquia na edição, em duas seções: "Tarefa principal", um lugar só (vazio mostra o "+", preenchido mostra a
 * tarefa com o "x"), e "Subtarefas", uma lista com "+" e "x" em cada linha. O "+" abre a folha de seleção de tarefas.
 * Só a edição tem estas seções.
 */
@Composable
internal fun HierarchySections(
    hierarchy: TaskHierarchyEditor,
    draft: TaskDraft,
) {
    val state by hierarchy.state.collectAsStateWithLifecycle()
    val now = remember { hierarchy.now() }
    val parentIds = listOfNotNull(draft.parentTaskId)
    Section(ParentText.title) {
        LinkedTasks(
            text = ParentText,
            ids = parentIds,
            canAdd = parentIds.isEmpty(),
            state = state,
            now = now,
            onAdd = { hierarchy.open(HierarchySlot.Parent) },
            onRemove = { hierarchy.removeParent() },
        )
    }
    Section(SubtasksText.title) {
        LinkedTasks(
            text = SubtasksText,
            ids = draft.subtaskIds,
            canAdd = true,
            state = state,
            now = now,
            onAdd = { hierarchy.open(HierarchySlot.Subtasks) },
            onRemove = hierarchy::removeSubtask,
        )
    }
    state.picker?.let { picker ->
        val text = if (picker.slot == HierarchySlot.Parent) ParentText else SubtasksText
        EntityPickerSheet(
            title = text.title,
            searchLabel = text.searchLabel,
            state = picker.search,
            failedMessage = TASK_SEARCH_FAILED,
            keyOf = { it.id },
            nameOf = { it.name },
            onType = hierarchy::type,
            onPick = hierarchy::pick,
            onClose = hierarchy::close,
            footer = {
                CreateFooter(
                    text = picker.search.typed.trim(),
                    footer = picker.footer,
                    canAsk = hierarchy.canAskHermes,
                    onCreate = hierarchy::create,
                    onAsk = hierarchy::askHermes,
                )
            },
        ) { card -> TaskChoice(card, now) }
    }
}

@Composable
private fun LinkedTasks(
    text: SlotText,
    ids: List<String>,
    canAdd: Boolean,
    state: HierarchyUiState,
    now: Instant,
    onAdd: () -> Unit,
    onRemove: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (state.loadFailed && ids.any { it !in state.cards }) {
            Text(
                text.loadFailed,
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                modifier =
                    Modifier.semantics {
                        liveRegion =
                            LiveRegionMode.Assertive
                    },
            )
        }
        ids.forEachIndexed { index, id ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            val card = state.cards[id]
            LinkedRow(
                card,
                if (state.loadFailed) UNAVAILABLE_TASK else LOADING_TASK,
                now,
                text.removeLabel(card?.name ?: "tarefa"),
            ) { onRemove(id) }
        }
        if (canAdd) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                AddButton(text.addLabel, onAdd)
                if (ids.isEmpty()) {
                    Text(
                        text.emptyLabel,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                    )
                }
            }
        }
    }
}

/** Uma tarefa ligada: o glifo só de leitura, o nome (ou "Carregando…") e, embaixo, o tipo e o quando; o "x" tira. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LinkedRow(
    card: TaskCard?,
    placeholder: String,
    now: Instant,
    removeLabel: String,
    onRemove: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.size(24.dp).padding(top = 3.dp)) { card?.let { TaskStatusGlyph(actor = it.actor, status = it.status, size = 20.dp) } }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                card?.name ?: placeholder,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (card != null) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    TaskKindMark(card.kind)
                    Text(cardWhenLabel(card, now), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
                }
            }
        }
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = onRemove)
                .semantics { contentDescription = removeLabel },
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(
                TaskEditIcons.x,
                size = 16.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}

/** Uma tarefa como escolha da folha: o nome e, embaixo, o tipo (código em mono) e quando. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TaskChoice(
    card: TaskCard,
    now: Instant,
) {
    Text(card.name, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        TaskKindMark(card.kind)
        Text(cardWhenLabel(card, now), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
    }
}

/**
 * O rodapé da folha: em vez de ligar uma tarefa que existe, criar uma nova com o texto da busca. "Criar" faz a tarefa só
 * com o nome; "Pedir ao Hermes" (só com sessão) manda o texto como pedido e acompanha até terminar.
 */
@Composable
private fun CreateFooter(
    text: String,
    footer: PickerFooter,
    canAsk: Boolean,
    onCreate: () -> Unit,
    onAsk: () -> Unit,
) {
    val enabled = text.isNotEmpty() && !footer.busy
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FooterAction(
            label = if (text.isEmpty()) "Criar tarefa" else "Criar “$text”",
            enabled = enabled,
            onClick = onCreate,
        ) {
            if (footer is PickerFooter.Creating) {
                SvgIcon(
                    ChatIcons.spinner,
                    size = 16.dp,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            } else {
                SvgIcon(
                    TaskEditIcons.plus,
                    size = 16.dp,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        }
        if (canAsk) {
            FooterAction(label = "Pedir ao Hermes", enabled = enabled, onClick = onAsk) {
                HermesBotIcon(
                    state = if (footer is PickerFooter.Asking) BotState.Thinking else BotState.Idle,
                    size = 18.dp,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        }
        when {
            text.isEmpty() && !footer.busy -> Hint(CREATE_HINT)
            footer is PickerFooter.Asking -> Hint(footer.progress ?: HERMES_ASKING)
            footer is PickerFooter.Failed -> Hint(footer.message, alert = true)
        }
    }
}

@Composable
private fun FooterAction(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        icon()
        Text(
            label,
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        )
    }
}

private const val DISABLED_ALPHA = 0.5f

@Composable
private fun Hint(
    text: String,
    alert: Boolean = false,
) {
    Text(
        text = text,
        modifier = Modifier.semantics { liveRegion = if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        color = if (alert) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    )
}
