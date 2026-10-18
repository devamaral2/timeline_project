package app.braid.mobile.ui.hub

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.ui.chat.AgentChatPanel
import app.braid.mobile.ui.chat.AgentChatViewModel
import app.braid.mobile.ui.chat.ChatCommand
import app.braid.mobile.ui.chat.ChatView
import app.braid.mobile.ui.event.CreateEventUiState
import app.braid.mobile.ui.event.CreateEventViewModel
import app.braid.mobile.ui.event.NewEventContent
import app.braid.mobile.ui.event.NewEventDraft
import app.braid.mobile.ui.event.TagSuggestionViewModel

/** O que o hub mostra: o chat é a porta; criar e pesquisar abrem pelos comandos "/" dele. */
enum class HubView { Chat, Create, Search }

/** O que “Criar” cria (`.creationToggle`, agora no cabeçalho). */
enum class CreateKind { Task, Event, Note }

/** A altura do painel: compacto no início do chat, alto no resto e a tela toda quando expandido. */
enum class HubSheetSize { Compact, Tall, Full }

/**
 * O painel de “Buscar e criar”: o `dialog.sectionMenu` do web, que abre sobre a
 * tela e deixa a barra inferior visível. Sem fechar nem barra de modos: fecha
 * tocando fora, e o chat leva a criar e pesquisar pela barra "/".
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
    onSizeChange: (HubSheetSize) -> Unit = {},
) {
    var view by rememberSaveable { mutableStateOf(HubView.Chat) }
    var kind by rememberSaveable { mutableStateOf(CreateKind.Task) }
    var expanded by rememberSaveable { mutableStateOf(false) }
    // O texto depois do comando (`/tarefa comprar pão`) preenche o formulário que ele abriu.
    var prefill by rememberSaveable { mutableStateOf("") }
    var chatView by remember { mutableStateOf(ChatView.Home) }
    val createViewModel = hiltViewModel<HubCreateViewModel>()
    val createState by createViewModel.state.collectAsStateWithLifecycle()
    val size =
        when {
            view != HubView.Chat -> HubSheetSize.Tall
            expanded -> HubSheetSize.Full
            chatView == ChatView.Home -> HubSheetSize.Compact
            else -> HubSheetSize.Tall
        }
    val backToChat = {
        createViewModel.clearError()
        view = HubView.Chat
    }

    LaunchedEffect(size) { onSizeChange(size) }
    BackHandler(enabled = view != HubView.Chat, onBack = backToChat)
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

    Column(modifier = modifier.fillMaxSize().padding(top = 10.dp)) {
        Box(
            modifier =
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(bottom = 2.dp)
                    .width(36.dp)
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(if (size == HubSheetSize.Full) Color.Transparent else MaterialTheme.colorScheme.outlineVariant),
        )
        when (view) {
            HubView.Chat ->
                if (chatViewModel != null) {
                    AgentChatPanel(
                        viewModel = chatViewModel,
                        expanded = expanded,
                        onToggleExpanded = { expanded = !expanded },
                        onCommand = { command, argument ->
                            prefill = argument
                            when (command) {
                                ChatCommand.Search -> view = HubView.Search
                                ChatCommand.Task, ChatCommand.Event, ChatCommand.Note -> {
                                    kind =
                                        when (command) {
                                            ChatCommand.Event -> CreateKind.Event
                                            ChatCommand.Note -> CreateKind.Note
                                            else -> CreateKind.Task
                                        }
                                    createViewModel.clearError()
                                    view = HubView.Create
                                }
                            }
                        },
                        onViewChange = { chatView = it },
                        onEntitiesChanged = onEntitiesChanged,
                    )
                } else {
                    Text(
                        modifier = Modifier.padding(20.dp),
                        text = "O chat não está disponível agora.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            HubView.Search ->
                HubSearchPanel(
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
                    initialQuery = prefill,
                    onBack = backToChat,
                    onOpenEvent = {
                        onClose()
                        onOpenEvent(it)
                    },
                    onOpenNote = {
                        onClose()
                        onOpenNote(it)
                    },
                )
            HubView.Create ->
                Column(modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 15.dp)) {
                    HubBackHeader(onBack = backToChat) {
                        KindChips(
                            selected = kind,
                            onSelect = {
                                kind = it
                                prefill = ""
                                createViewModel.clearError()
                            },
                        )
                    }
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        key(kind) {
                            when (kind) {
                                CreateKind.Task ->
                                    TaskCreateForm(
                                        state = createState,
                                        onSubmit = createViewModel::createTask,
                                        onEdited = createViewModel::clearError,
                                        initialName = prefill,
                                    )
                                CreateKind.Note ->
                                    NoteCreateForm(
                                        state = createState,
                                        onSubmit = createViewModel::createNote,
                                        onEdited = createViewModel::clearError,
                                        initialContent = prefill,
                                    )
                                CreateKind.Event ->
                                    EventCreateForm(
                                        initialName = prefill,
                                        onCreated = {
                                            onEntitiesChanged()
                                            onClose()
                                        },
                                        onCancel = backToChat,
                                    )
                            }
                        }
                    }
                }
        }
    }
}

/** O cabeçalho de criar e pesquisar: a seta “Voltar para o chat” e o que vier ao lado. */
@Composable
@Suppress("ktlint:standard:function-naming")
fun HubBackHeader(
    onBack: () -> Unit,
    content: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier =
                Modifier
                    .offset(x = (-12).dp)
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(onClickLabel = "Voltar para o chat", onClick = onBack)
                    .semantics { contentDescription = "Voltar para o chat" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideIcons.arrowLeft(),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(20.dp),
            )
        }
        Box(modifier = Modifier.weight(1f).offset(x = (-12).dp)) { content() }
    }
}

/** Tarefa, Evento e Nota como pílulas de fio; a escolhida ganha o anel na cor do texto. */
@Composable
@Suppress("ktlint:standard:function-naming")
private fun KindChips(
    selected: CreateKind,
    onSelect: (CreateKind) -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val options =
        listOf(
            Triple(CreateKind.Task, "Tarefa", LucideIcons.squareCheck()),
            Triple(CreateKind.Event, "Evento", LucideIcons.calendarDays()),
            Triple(CreateKind.Note, "Nota", LucideIcons.notepadText()),
        )
    Row(
        modifier = Modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        options.forEach { (value, label, icon) ->
            val active = value == selected
            Row(
                modifier =
                    Modifier
                        .height(36.dp)
                        .clip(CircleShape)
                        .border(BorderStroke(if (active) 2.dp else 1.dp, if (active) colors.onSurface else colors.outline), CircleShape)
                        .clickable(onClickLabel = label) { onSelect(value) }
                        .semantics { this.selected = active }
                        .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (active) colors.onSurface else colors.onSurfaceVariant,
                    modifier = Modifier.size(17.dp),
                )
                Text(
                    text = label,
                    fontSize = 14.sp,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (active) colors.onSurface else colors.onSurfaceVariant,
                )
            }
        }
    }
}

/** “Criar → Evento”: o formulário de novo evento que já existe, dentro do painel. */
@Composable
@Suppress("ktlint:standard:function-naming")
private fun EventCreateForm(
    onCreated: () -> Unit,
    onCancel: () -> Unit,
    initialName: String = "",
    viewModel: CreateEventViewModel = hiltViewModel(),
    tagViewModel: TagSuggestionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf(NewEventDraft(name = initialName)) }

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
