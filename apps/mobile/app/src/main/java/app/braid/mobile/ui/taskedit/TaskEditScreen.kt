package app.braid.mobile.ui.taskedit

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.task.RecurrenceDraft
import app.braid.mobile.domain.task.TaskDraft
import app.braid.mobile.domain.task.TaskDraftField
import app.braid.mobile.ui.taskartifacts.ArtifactEditActions
import app.braid.mobile.ui.taskartifacts.TaskEditArtifactsSection
import app.braid.mobile.ui.taskdetail.Message

/** A rota do formulário de tarefa: criar (sem `taskId`) ou editar. Salvar, Descartar e o voltar do sistema saem da tela. */
@Composable
fun TaskEditPage(
    onLeave: () -> Unit,
    viewModel: TaskEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val done = (state as? TaskEditUiState.Form)?.done == true
    LaunchedEffect(done) { if (done) onLeave() }
    TaskEditScreen(
        state = state,
        onLeave = onLeave,
        onRetry = viewModel::retry,
        actions =
            TaskEditActions(
                update = viewModel::update,
                addReminder = viewModel::addReminder,
                removeReminder = viewModel::removeReminder,
                commitTag = viewModel::commitTag,
                removeTag = viewModel::removeTag,
                suggestTags = viewModel::suggestTags,
                typeLocation = viewModel::typeLocation,
                choosePlace = viewModel::choosePlace,
                dismissPlaces = viewModel::dismissPlaces,
                defineRecurrence = viewModel::defineRecurrence,
                changeRecurrence = viewModel::changeRecurrence,
                clearRecurrence = viewModel::clearRecurrence,
                resetRecurrence = viewModel::resetRecurrence,
                deleteSeries = viewModel::deleteSeries,
                save = viewModel::save,
                hierarchy = viewModel.hierarchy,
                projectPicker = viewModel.projectPicker,
                openProjectPicker = viewModel::openProjectPicker,
                artifacts =
                    ArtifactEditActions(
                        picker = viewModel.artifactPicker,
                        open = viewModel::openArtifactPicker,
                        setQuantity = viewModel::setArtifactQuantity,
                        remove = viewModel::removeArtifact,
                        move = viewModel::moveArtifact,
                    ),
            ),
    )
}

/** O que o formulário pede ao [TaskEditViewModel]; cada ticket que acrescenta uma seção acrescenta as suas ações aqui. */
class TaskEditActions(
    val update: ((TaskDraft) -> TaskDraft) -> Unit,
    val addReminder: (Int) -> Unit,
    val removeReminder: (Int) -> Unit,
    val commitTag: (String) -> Unit,
    val removeTag: (String) -> Unit,
    val suggestTags: (String) -> Unit,
    val typeLocation: (String) -> Unit,
    val choosePlace: (String) -> Unit,
    val dismissPlaces: () -> Unit,
    val defineRecurrence: () -> Unit,
    val changeRecurrence: ((RecurrenceDraft) -> RecurrenceDraft) -> Unit,
    val clearRecurrence: () -> Unit,
    val resetRecurrence: () -> Unit,
    val deleteSeries: () -> Unit,
    val save: () -> Unit,
    /** O campo "Projeto" (spec 51): abre a escolha, na criação e na edição. */
    val projectPicker: TaskProjectPicker,
    val openProjectPicker: () -> Unit,
    /** A hierarquia (ticket 15): só a edição a mostra. */
    val hierarchy: TaskHierarchyEditor? = null,
    /** Os documentos (ticket 16): só a edição os mostra. */
    val artifacts: ArtifactEditActions? = null,
)

@Composable
fun TaskEditScreen(
    state: TaskEditUiState,
    onLeave: () -> Unit,
    onRetry: () -> Unit,
    actions: TaskEditActions,
) {
    val form = state as? TaskEditUiState.Form
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .imePadding(),
    ) {
        EditBar(
            title = if (form != null && form.taskId == null) "Nova tarefa" else "Editar tarefa",
            onBack = if (form == null) onLeave else null,
        )
        when (state) {
            TaskEditUiState.Loading -> Notice("Carregando tarefa…")
            TaskEditUiState.Missing -> Notice("Tarefa não encontrada.", alert = true)
            TaskEditUiState.AgentTask -> Notice("Esta tarefa é do agente e não se edita aqui.")
            TaskEditUiState.Failed ->
                Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Message("Não foi possível carregar a tarefa. Tente novamente.", alert = true)
                    BraidPill(text = "Tentar de novo", onClick = onRetry)
                }
            is TaskEditUiState.Form -> FormBody(state, onLeave, actions)
        }
    }
}

@Composable
private fun Notice(
    text: String,
    alert: Boolean = false,
) {
    Box(Modifier.padding(horizontal = 20.dp)) { Message(text, alert) }
}

/** O topo do formulário: só o rótulo em mono, sem botões (o voltar fica nos estados sem formulário). */
@Composable
private fun EditBar(
    title: String,
    onBack: (() -> Unit)?,
) {
    Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) {
            Box(
                Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onBack).semantics {
                    contentDescription =
                        "Voltar"
                },
                contentAlignment = Alignment.Center,
            ) {
                SvgIcon(
                    BraidIcons.arrowLeft,
                    size = 20.dp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clearAndSetSemantics {},
                )
            }
        } else {
            Box(Modifier.size(48.dp))
        }
        Text(
            text = title.uppercase(),
            modifier = Modifier.weight(1f).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.1.em,
            textAlign = TextAlign.Center,
        )
        Box(Modifier.size(48.dp))
    }
}

@Composable
private fun ColumnScope.FormBody(
    form: TaskEditUiState.Form,
    onLeave: () -> Unit,
    actions: TaskEditActions,
) {
    val draft = form.draft
    val creating = form.taskId == null
    Column(
        Modifier
            .weight(1f)
            .verticalScroll(rememberScrollState())
            .padding(start = 20.dp, end = 20.dp, top = 6.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        HeaderFields(draft, form.errors, actions.update)
        InfoSection(draft, form.errors, creating, form.recurrence, actions)
        LocationSection(draft.location, form, actions)
        TagsSection(draft.tags, form.tagSuggestions, actions)
        DescriptionSection(draft.description) { value -> actions.update { it.copy(description = value) } }
        // A hierarquia (tarefa principal e subtarefas, ticket 15) e os documentos (ticket 16) entram aqui, só na edição.
        if (!creating) actions.hierarchy?.let { HierarchySections(it, draft) }
        if (!creating) actions.artifacts?.let { TaskEditArtifactsSection(draft, it) }
        ProjectPickerHost(actions.projectPicker)
        form.failure?.let { failure ->
            Text(
                text = failure,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    Footer(saving = form.saving, onDiscard = onLeave, onSave = actions.save)
}

/** Descartar e Salvar, no pé da tela. Salvar vira "Salvando…" e não aceita outro toque enquanto grava. */
@Composable
private fun Footer(
    saving: Boolean,
    onDiscard: () -> Unit,
    onSave: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BraidPill(text = "Descartar", onClick = onDiscard)
        Box(
            Modifier
                .height(40.dp)
                .alpha(if (saving) SAVING_ALPHA else 1f)
                .background(MaterialTheme.colorScheme.primary, CircleShape)
                .clickable(enabled = !saving, role = Role.Button, onClick = onSave)
                .padding(horizontal = 20.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = if (saving) "Salvando…" else "Salvar",
                color = MaterialTheme.colorScheme.onPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

private const val SAVING_ALPHA = 0.6f

/** O erro de validação sob o campo que o causou. */
@Composable
internal fun FieldError(
    errors: Map<TaskDraftField, String>,
    field: TaskDraftField,
) {
    errors[field]?.let {
        Text(
            text = it,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.error,
            fontSize = 13.sp,
            lineHeight = 18.sp,
        )
    }
}
