package app.braid.mobile.ui.documents

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.BraidPullToRefresh
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactDrawer
import app.braid.mobile.domain.artifact.ArtifactRowFacts
import app.braid.mobile.domain.artifact.ArtifactRowPartStyle
import app.braid.mobile.domain.artifact.artifactRowFacts
import app.braid.mobile.ui.agenda.ListSkeleton
import app.braid.mobile.ui.shell.ExecutionReserveSpacer
import app.braid.mobile.ui.shell.MainTab
import app.braid.mobile.ui.shell.PublishSectionMenu
import app.braid.mobile.ui.shell.SectionMenuModel
import app.braid.mobile.ui.shell.SectionSearch
import app.braid.mobile.ui.tasks.AgentStatusIcon
import app.braid.mobile.ui.tasks.agentStatusIcon
import app.braid.mobile.ui.tasks.agentStatusLabel
import app.braid.mobile.ui.tasks.agentToneColor
import java.time.Instant

/**
 * A aba Artefatos: os artefatos do usuário em uma gaveta por tipo, cada uma do mais recente para o mais antigo, e o menu
 * da seção com a busca.
 */
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
    DocumentsContent(
        state,
        onOpenDocument,
        onToggleDrawer = viewModel::toggleDrawer,
        onRetry = viewModel::retry,
        onClear = viewModel::clearFilters,
        onRefresh = viewModel::pull,
    )
    // O menu da seção: a busca só aparece quando há artefato; as listas são as de executor, do shell.
    PublishSectionMenu(
        tab = MainTab.Documents,
        model =
            SectionMenuModel(
                count = state.shown?.size,
                search = if (state.hasArtifacts) SectionSearch("Buscar nos artefatos", state.query, viewModel::search) else null,
                filtered = state.filtered,
                onClear = viewModel::clearFilters,
            ),
    )
}

@Composable
fun DocumentsContent(
    state: DocumentsUiState,
    onOpenDocument: (String) -> Unit,
    onToggleDrawer: (ArtifactDrawer) -> Unit,
    onRetry: () -> Unit,
    onClear: () -> Unit,
    onRefresh: () -> Unit,
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
        state.notice?.let { notice ->
            Text(
                text = notice,
                modifier = Modifier.padding(vertical = 6.dp).semantics { liveRegion = LiveRegionMode.Assertive },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
        }
        val shown = state.shown
        // Puxar para recarregar: fora da primeira leitura (o esqueleto). O erro e o vazio rolam, para o gesto ter de onde vir.
        BraidPullToRefresh(
            refreshing = state.refreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxWidth().weight(1f),
            enabled = shown != null || state.failed,
        ) {
            when {
                state.failed -> Scrolling { LoadFailed(onRetry) }
                shown == null -> LoadingList()
                shown.isEmpty() -> Scrolling { EmptyList(state.empty ?: EmptyKind.NoneYet, onClear) }
                else -> {
                    val now = remember(shown) { Instant.now() }
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 120.dp + bottomInset)) {
                        state.drawers.forEach { drawer ->
                            val expanded = state.isExpanded(drawer)
                            item(key = "drawer:${drawer.type.code}") { DrawerHead(drawer, expanded, onToggle = { onToggleDrawer(drawer) }) }
                            if (expanded) {
                                itemsIndexed(drawer.artifacts, key = { _, artifact -> artifact.id }) { index, artifact ->
                                    // O fio fica entre os artefatos da gaveta: o primeiro de cada uma não tem.
                                    if (index > 0) {
                                        HorizontalDivider(
                                            Modifier.padding(start = ROW_DIVIDER_INSET),
                                            color = MaterialTheme.colorScheme.outline,
                                        )
                                    }
                                    DocumentRow(artifact, now, onClick = { onOpenDocument(artifact.id) })
                                }
                            }
                        }
                        // A gaveta de execução, quando há, ocupa o pé da tela: o último artefato continua alcançável acima dela.
                        item { ExecutionReserveSpacer() }
                    }
                }
            }
        }
    }
}

/** O estado que não é lista (erro, vazio) rolando na vertical: o puxar para recarregar precisa de uma rolagem de onde vir. */
@Composable
private fun Scrolling(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { content() }
}

/** O hairline entre as linhas começa onde começa o texto (glifo de 22 dp e 12 dp de respiro), como no web. */
private val ROW_DIVIDER_INSET = 34.dp

/** O cabeçalho da gaveta, o mesmo desenho da lista de tarefas: seta, o tipo em mono, a contagem e o fio até a margem. */
@Composable
private fun DrawerHead(
    drawer: ArtifactDrawer,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 44.dp)
            .semantics(mergeDescendants = true) {
                heading()
                stateDescription = if (expanded) "Aberto" else "Recolhido"
                onClick(label = if (expanded) "Recolher ${drawer.title}" else "Abrir ${drawer.title}") {
                    onToggle()
                    true
                }
            }.clickable(role = Role.Button, onClick = onToggle),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SvgIcon(
            if (expanded) BraidIcons.chevronDown else BraidIcons.chevronRight,
            size = 14.dp,
            color = muted,
            strokeWidth = 2f,
            modifier = Modifier.clearAndSetSemantics {},
        )
        Text(
            text = drawer.title.uppercase(),
            color = muted,
            fontFamily = BraidMonoFont,
            fontWeight = FontWeight.Medium,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.08.em,
        )
        Text(
            text = drawer.artifacts.size.toString(),
            color = documentTokens().faint,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
        )
        HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline)
    }
}

/** A linha: o desenho do tipo, o título, a linha de apoio e, na ponta direita, o número do tipo ou o status do agente. */
@Composable
private fun DocumentRow(
    artifact: Artifact,
    now: Instant,
    onClick: () -> Unit,
) {
    val facts = remember(artifact, now) { artifactRowFacts(artifact, now) }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        SvgIcon(
            DocumentIcons.glyph(artifact.type),
            size = 22.dp,
            color = muted,
            strokeWidth = 1.75f,
            modifier = Modifier.clearAndSetSemantics {},
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = artifact.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            SupportLine(facts)
        }
        RowEnd(facts)
    }
}

/** Uma linha só: o trecho [ArtifactRowPartStyle.Fill] ou o aviso ocupa o que sobra e corta; o que não couber sai de vista. */
@Composable
private fun SupportLine(facts: ArtifactRowFacts) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(Modifier.fillMaxWidth().clipToBounds(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        facts.support.forEach { part ->
            val cuts = part.style == ArtifactRowPartStyle.Fill || part.style == ArtifactRowPartStyle.Alert
            val mono = part.style == ArtifactRowPartStyle.Mono
            Text(
                text = part.text,
                modifier = if (cuts) Modifier.weight(1f, fill = false) else Modifier,
                color = if (part.style == ArtifactRowPartStyle.Alert) MaterialTheme.colorScheme.error else muted,
                fontFamily = if (mono) BraidMonoFont else null,
                fontSize = if (mono) 12.sp else 13.sp,
                lineHeight = 18.sp,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
            )
        }
        facts.tags.forEach { tag ->
            Text(
                text = "#$tag",
                color = tagColors(tag).color,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                maxLines = 1,
                softWrap = false,
            )
        }
    }
}

@Composable
private fun RowEnd(facts: ArtifactRowFacts) {
    val status = facts.agentStatus
    if (status != null) {
        val color = agentToneColor(agentStatusIcon(status).tone)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            // O ícone já diz o nome por inteiro ("Agente, trabalhando"); o texto é só para quem enxerga.
            Text(
                text = agentStatusLabel(status).orEmpty(),
                modifier = Modifier.clearAndSetSemantics {},
                color = color,
                fontSize = 13.sp,
                lineHeight = 22.sp,
            )
            AgentStatusIcon(status)
        }
    } else {
        facts.figure?.let { figure ->
            Text(
                text = figure,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 22.sp,
            )
        }
    }
}

@Composable
private fun LoadingList() {
    Column {
        ListSkeleton()
        Text(
            text = "Carregando artefatos…",
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
            text = "Não foi possível carregar os artefatos.",
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
            EmptyKind.NoneYet -> "Nenhum artefato ainda" to "Os artefatos aparecem aqui assim que existirem."
            EmptyKind.NothingFound -> "Nenhum artefato encontrado" to "Nada combina com os filtros escolhidos."
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
