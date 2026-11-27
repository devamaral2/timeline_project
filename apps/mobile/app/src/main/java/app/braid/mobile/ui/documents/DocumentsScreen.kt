package app.braid.mobile.ui.documents

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.ui.agenda.ListSkeleton
import app.braid.mobile.ui.shell.ExecutionReserveSpacer
import app.braid.mobile.ui.shell.MainTab
import app.braid.mobile.ui.shell.PublishSectionMenu
import app.braid.mobile.ui.shell.SectionMenuModel
import app.braid.mobile.ui.shell.SectionSearch

/** A aba Documentos: os documentos do usuário, do mais recente para o mais antigo, e o menu da seção com a busca. */
@Composable
fun DocumentsScreen(
    onOpenDocument: (String) -> Unit,
    viewModel: DocumentsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // O primeiro ON_RESUME é o de abrir a tela, e o ViewModel já leu a lista ao nascer.
    var firstResume by remember { mutableStateOf(true) }
    LifecycleResumeEffect(Unit) {
        if (firstResume) firstResume = false else viewModel.onResume()
        onPauseOrDispose {}
    }
    DocumentsContent(state, onOpenDocument, onRetry = viewModel::retry, onClear = viewModel::clearFilters)
    // O menu da seção: a busca só aparece quando há documento; as listas são as de executor, do shell.
    PublishSectionMenu(
        tab = MainTab.Documents,
        model =
            SectionMenuModel(
                count = state.shown?.size,
                search = if (state.hasArtifacts) SectionSearch("Buscar nos documentos", state.query, viewModel::search) else null,
                filtered = state.filtered,
                onClear = viewModel::clearFilters,
            ),
    )
}

@Composable
fun DocumentsContent(
    state: DocumentsUiState,
    onOpenDocument: (String) -> Unit,
    onRetry: () -> Unit,
    onClear: () -> Unit,
) {
    val bottomInset = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(horizontal = 20.dp),
    ) {
        Text(
            text = state.caption.uppercase(),
            modifier = Modifier.padding(top = 14.dp, bottom = 10.dp).semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
        val shown = state.shown
        when {
            state.failed -> LoadFailed(onRetry)
            shown == null -> LoadingList()
            shown.isEmpty() -> EmptyList(state.empty ?: EmptyKind.NoneYet, onClear)
            else ->
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 120.dp + bottomInset)) {
                    item { HorizontalDivider(color = MaterialTheme.colorScheme.outline) }
                    items(shown, key = { it.id }) { artifact ->
                        DocumentRow(artifact, onClick = { onOpenDocument(artifact.id) })
                        HorizontalDivider(Modifier.padding(start = 60.dp), color = MaterialTheme.colorScheme.outline)
                    }
                    // A gaveta de execução, quando há, ocupa o pé da tela: o último documento continua alcançável acima dela.
                    item { ExecutionReserveSpacer() }
                }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DocumentRow(
    artifact: Artifact,
    onClick: () -> Unit,
) {
    val faint = documentTokens().faint
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        DocumentSheet(artifact.type, Modifier.padding(top = 2.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = artifact.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(artifactTypeLabel(artifact.type), color = faint, fontSize = 13.sp, lineHeight = 20.sp)
                artifact.tags.forEach { tag ->
                    val tagColor = tagColors(tag).color
                    Text(
                        text =
                            buildAnnotatedString {
                                withStyle(SpanStyle(color = faint)) { append("· ") }
                                withStyle(SpanStyle(color = tagColor)) { append("#$tag") }
                            },
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadingList() {
    Column {
        ListSkeleton()
        Text(
            text = "Carregando documentos…",
            modifier = Modifier.padding(top = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
    }
}

@Composable
private fun LoadFailed(onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(
            text = "Não foi possível carregar os documentos.",
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        BraidPill(text = "Tentar de novo", onClick = onRetry)
    }
}

/** O quadro tracejado do estado vazio, como o `.empty` do web. */
@Composable
private fun EmptyList(
    kind: EmptyKind,
    onClear: () -> Unit,
) {
    val dash = MaterialTheme.colorScheme.outlineVariant
    val (title, text) =
        when (kind) {
            EmptyKind.NoneYet -> "Nenhum documento ainda" to "Os documentos aparecem aqui assim que existirem."
            EmptyKind.NothingFound -> "Nenhum documento encontrado" to "Nada combina com os filtros escolhidos."
        }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawRoundRect(
                        color = dash,
                        cornerRadius = CornerRadius(14.dp.toPx()),
                        style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
                    )
                }.padding(horizontal = 24.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SvgIcon(BraidIcons.fileText, size = 32.dp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            title,
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 21.sp, textAlign = TextAlign.Center)
        if (kind == EmptyKind.NothingFound) BraidPill(text = "Limpar filtros", onClick = onClear)
    }
}
