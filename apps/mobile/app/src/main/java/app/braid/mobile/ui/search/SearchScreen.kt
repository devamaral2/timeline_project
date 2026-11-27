package app.braid.mobile.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.ui.picker.EntityPickerState
import app.braid.mobile.ui.picker.PickerSearchStatus

/** O espaço da barra inferior, que continua à vista por baixo do painel do chat. */
private val DockReserve = 90.dp
private val PillShape = RoundedCornerShape(999.dp)

/**
 * A pesquisa dentro do painel do chat ("Pesquisar", `/buscar`), como a vista do web: o voltar para o chat e o campo
 * redondo no topo, "No seu espaço" (sem texto) ou "Resultados", e a lista de tarefas e artefatos; tocar num deles abre o
 * detalhe.
 */
@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    argument: String,
    onBack: () -> Unit,
    onOpen: (SearchResult) -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(viewModel, argument) { viewModel.start(argument) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    SearchContent(state, onType = viewModel::type, onBack = onBack, onOpen = onOpen, modifier = modifier)
}

@Composable
fun SearchContent(
    state: EntityPickerState<SearchResult>,
    onType: (String) -> Unit,
    onBack: () -> Unit,
    onOpen: (SearchResult) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val density = LocalDensity.current
    // Com o teclado aberto a lista termina acima dele, para o último resultado ser alcançável.
    val reserved = DockReserve + with(density) { WindowInsets.navigationBars.getBottom(density).toDp() }
    val bottom = maxOf(reserved, with(density) { WindowInsets.ime.getBottom(density).toDp() })
    Column(
        modifier
            .fillMaxSize()
            .background(scheme.background)
            .pointerInput(Unit) { detectTapGestures { } }
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(start = 16.dp, end = 16.dp)
            .semantics { contentDescription = "Pesquisar" },
    ) {
        Header(state.typed, onType, onBack)
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(top = 8.dp, bottom = bottom)) {
            item {
                Text(
                    if (state.query.isEmpty()) "No seu espaço" else "Resultados",
                    modifier = Modifier.padding(top = 20.dp, bottom = 12.dp),
                    color = scheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
            }
            items(state.results, key = { "${it::class.simpleName}:${it.id}" }) { result -> ResultRow(result, onOpen) }
            item { Footer(state) }
        }
    }
}

@Composable
private fun Header(
    typed: String,
    onType: (String) -> Unit,
    onBack: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(top = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = onBack)
                .semantics { contentDescription = "Voltar para o chat" },
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(BraidIcons.arrowLeft, size = 22.dp, color = scheme.onBackground, modifier = Modifier.clearAndSetSemantics {})
        }
        Row(
            Modifier
                .weight(1f)
                .background(scheme.surface, PillShape)
                .border(1.dp, if (focused) tokens.brand else scheme.outline, PillShape)
                .padding(horizontal = 14.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SvgIcon(BraidIcons.search, size = 20.dp, color = tokens.brandAccent, modifier = Modifier.clearAndSetSemantics {})
            BasicTextField(
                value = typed,
                onValueChange = onType,
                singleLine = true,
                interactionSource = interaction,
                textStyle = MaterialTheme.typography.bodyLarge.copy(fontSize = 16.sp, color = scheme.onBackground),
                cursorBrush = SolidColor(tokens.brand),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier =
                    Modifier
                        .weight(1f)
                        .focusRequester(focus)
                        .semantics { contentDescription = "Pesquisar tarefas e artefatos" },
                decorationBox = { inner ->
                    Box(Modifier.heightIn(min = 40.dp).padding(vertical = 8.dp), contentAlignment = Alignment.CenterStart) {
                        if (typed.isEmpty()) Text("Buscar tarefas e artefatos", color = tokens.faint, fontSize = 16.sp)
                        inner()
                    }
                },
            )
        }
    }
}

@Composable
private fun ResultRow(
    result: SearchResult,
    onOpen: (SearchResult) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val (icon, title, kind) =
        when (result) {
            is SearchResult.Task -> Triple(BraidIcons.calendarDays, result.card.name, "Tarefa")
            is SearchResult.Document ->
                Triple(BraidIcons.fileText, result.artifact.name, "Artefato · ${artifactTypeLabel(result.artifact.type)}")
        }
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button) { onOpen(result) }
                .padding(horizontal = 4.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SvgIcon(icon, size = 24.dp, color = braidTokens().brandAccent, strokeWidth = 1.3f, modifier = Modifier.clearAndSetSemantics {})
            Column(Modifier.weight(1f)) {
                Text(
                    title,
                    color = scheme.onBackground,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(kind, modifier = Modifier.padding(top = 4.dp), color = scheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
            }
        }
        HorizontalDivider(color = scheme.outline)
    }
}

/** O que vem depois da lista: buscando, a falha ou o "nenhum resultado" do web. */
@Composable
private fun Footer(state: EntityPickerState<SearchResult>) {
    val text =
        when {
            state.status == PickerSearchStatus.Failed -> "Não foi possível pesquisar. Tente de novo."
            state.status == PickerSearchStatus.Loading && state.results.isEmpty() -> "Buscando…"
            state.status == PickerSearchStatus.Ready && state.results.isEmpty() -> "Nenhum resultado. Que tal criar algo novo?"
            else -> return
        }
    Text(
        text,
        modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
        color =
            if (state.status ==
                PickerSearchStatus.Failed
            ) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        fontSize = 12.sp,
        lineHeight = 19.sp,
    )
}
