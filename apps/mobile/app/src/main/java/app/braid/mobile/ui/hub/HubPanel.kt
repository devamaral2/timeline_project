package app.braid.mobile.ui.hub

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.ui.chat.AgentChatPanel
import app.braid.mobile.ui.chat.AgentChatViewModel
import app.braid.mobile.ui.event.CreateEventUiState
import app.braid.mobile.ui.event.CreateEventViewModel
import app.braid.mobile.ui.event.NewEventContent
import app.braid.mobile.ui.event.NewEventDraft
import app.braid.mobile.ui.event.TagSuggestionViewModel

/** Os três modos do hub “Buscar e criar” (`.hubModes` do web). */
enum class HubMode { Chat, Create, Search }

/** O que a aba “Criar” cria (`.creationToggle`). */
enum class CreateKind { Task, Event, Note }

/**
 * O painel de “Buscar e criar”: alça, fechar, o conteúdo do modo e, embaixo, o
 * dock com os modos (e, em “Criar”, o tipo). É o `dialog.sectionMenu` do web, que
 * abre sobre a tela e deixa a barra inferior visível.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun HubPanel(
    chatViewModel: AgentChatViewModel?,
    onClose: () -> Unit,
    onEntitiesChanged: () -> Unit,
    onOpenEvent: (String) -> Unit,
    onOpenNote: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var mode by rememberSaveable { mutableStateOf(HubMode.Chat) }
    var kind by rememberSaveable { mutableStateOf(CreateKind.Task) }
    val createViewModel = hiltViewModel<HubCreateViewModel>()
    val createState by createViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(createViewModel) {
        createViewModel.effects.collect { effect ->
            when (effect) {
                HubCreateEffect.TaskCreated -> onClose()
                is HubCreateEffect.NoteCreated -> {
                    onClose()
                    onOpenNote(effect.noteId)
                }
            }
        }
    }

    Column(modifier = modifier.fillMaxSize().padding(start = 26.dp, end = 26.dp, top = 10.dp, bottom = 15.dp)) {
        Box(
            modifier =
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .width(30.dp)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.outline),
        )
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 12.dp),
            horizontalArrangement = Arrangement.End,
        ) {
            Box(
                modifier =
                    Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .clickable(onClickLabel = "Fechar painel", onClick = onClose)
                        .semantics { contentDescription = "Fechar painel" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = LucideIcons.close(),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(17.dp),
                )
            }
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when (mode) {
                HubMode.Chat ->
                    if (chatViewModel != null) {
                        AgentChatPanel(viewModel = chatViewModel, onEntitiesChanged = onEntitiesChanged)
                    } else {
                        Text("O chat não está disponível agora.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                HubMode.Search ->
                    HubSearchPanel(
                        onOpenEvent = {
                            onClose()
                            onOpenEvent(it)
                        },
                        onOpenNote = {
                            onClose()
                            onOpenNote(it)
                        },
                    )
                HubMode.Create ->
                    when (kind) {
                        CreateKind.Task ->
                            TaskCreateForm(
                                state = createState,
                                onSubmit = createViewModel::createTask,
                                onEdited = createViewModel::clearError,
                            )
                        CreateKind.Note ->
                            NoteCreateForm(
                                state = createState,
                                onSubmit = createViewModel::createNote,
                                onEdited = createViewModel::clearError,
                            )
                        CreateKind.Event ->
                            EventCreateForm(
                                onCreated = {
                                    onEntitiesChanged()
                                    onClose()
                                },
                                onCancel = onClose,
                            )
                    }
            }
        }
        Column(modifier = Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            if (mode == HubMode.Create) {
                PillToggle(
                    options =
                        listOf(
                            PillOption(CreateKind.Task, "Tarefa", LucideIcons.squareCheck(LucideIcons.NAV_STROKE)),
                            PillOption(CreateKind.Event, "Evento", LucideIcons.calendarDays(LucideIcons.NAV_STROKE)),
                            PillOption(CreateKind.Note, "Nota", LucideIcons.notepadText(LucideIcons.NAV_STROKE)),
                        ),
                    selected = kind,
                    onSelect = {
                        kind = it
                        createViewModel.clearError()
                    },
                )
            }
            PillToggle(
                options =
                    listOf(
                        PillOption(HubMode.Chat, "Chat com IA", LucideIcons.braidAssistant(LucideIcons.NAV_STROKE)),
                        PillOption(HubMode.Create, "Criar", LucideIcons.circlePlus(LucideIcons.NAV_STROKE)),
                        PillOption(HubMode.Search, "Pesquisar", LucideIcons.search(LucideIcons.NAV_STROKE)),
                    ),
                selected = mode,
                onSelect = { mode = it },
            )
        }
    }
}

/** “Criar → Evento”: o formulário de novo evento que já existe, dentro do painel. */
@Composable
@Suppress("ktlint:standard:function-naming")
private fun EventCreateForm(
    onCreated: () -> Unit,
    onCancel: () -> Unit,
    viewModel: CreateEventViewModel = hiltViewModel(),
    tagViewModel: TagSuggestionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf(NewEventDraft()) }

    LaunchedEffect(state) {
        if (state is CreateEventUiState.Success) {
            viewModel.reset()
            onCreated()
        }
    }

    NewEventContent(
        draft = draft,
        state = state,
        modifier = Modifier.fillMaxSize(),
        onDraftChange = { draft = it },
        onSubmit = { viewModel.submit(draft) },
        onBack = onCancel,
        tagViewModel = tagViewModel,
        contentPadding = 0.dp,
    )
}
