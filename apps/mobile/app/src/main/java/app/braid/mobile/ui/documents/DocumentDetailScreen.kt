package app.braid.mobile.ui.documents

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
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
import app.braid.mobile.domain.artifact.ArtifactTaskLink
import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.domain.artifact.whenLabel
import java.time.Instant

/** O detalhe de um documento: lê `GET /api/artifacts/{id}` e, num alimento em cálculo, o relê enquanto a tela está à vista. */
@Composable
fun DocumentDetailPage(
    onBack: () -> Unit,
    onOpenTask: (String) -> Unit,
    viewModel: DocumentDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        viewModel.setVisible(true)
        onPauseOrDispose { viewModel.setVisible(false) }
    }
    DocumentDetailContent(state, onBack = onBack, onOpenTask = onOpenTask, onRetry = viewModel::retry)
}

@Composable
fun DocumentDetailContent(
    state: DocumentDetailUiState,
    onBack: () -> Unit,
    onOpenTask: (String) -> Unit,
    onRetry: () -> Unit,
) {
    val bottomInset = with(LocalDensity.current) { WindowInsets.navigationBars.getBottom(this).toDp() }
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        TopBar(onBack)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 32.dp + bottomInset),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            when (state) {
                DocumentDetailUiState.Loading -> Message("Carregando documento…", alert = false)
                DocumentDetailUiState.Missing -> Message("Documento não encontrado.", alert = true)
                DocumentDetailUiState.Error -> {
                    Message("Não foi possível carregar o documento. Tente novamente.", alert = true)
                    BraidPill(text = "Tentar de novo", onClick = onRetry)
                }
                is DocumentDetailUiState.Ready -> ReadyContent(state, onOpenTask)
            }
        }
    }
}

@Composable
private fun TopBar(onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(44.dp)
                .clickable(role = Role.Button, onClick = onBack)
                .semantics { contentDescription = "Voltar para Documentos" },
            contentAlignment = Alignment.Center,
        ) {
            SvgIcon(
                BraidIcons.chevronLeft,
                size = 22.dp,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
        Text(
            text = "Documento",
            modifier = Modifier.padding(start = 4.dp),
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 15.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun Message(
    text: String,
    alert: Boolean,
) {
    Text(
        text = text,
        modifier = Modifier.padding(top = 28.dp).semantics { liveRegion = if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReadyContent(
    state: DocumentDetailUiState.Ready,
    onOpenTask: (String) -> Unit,
) {
    val artifact = state.artifact
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = artifactTypeLabel(artifact.type).uppercase(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.1.em,
        )
        Text(text = artifact.name, color = MaterialTheme.colorScheme.onBackground, style = MaterialTheme.typography.headlineLarge)
    }
    if (artifact.tags.isNotEmpty() || artifact.global) {
        Column {
            if (artifact.tags.isNotEmpty()) {
                FactBlock("Tags") {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        artifact.tags.forEach { tag ->
                            Text(
                                "#$tag",
                                color = tagColors(tag).color,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }
            if (artifact.global) FactRow("Origem", "Catálogo global")
        }
    }
    ArtifactContent(artifact)
    if (state.showsTasks) TasksSection(artifact, state.now, onOpenTask)
    RecordSection(artifact, state.now)
}

@Composable
private fun FactBlock(
    label: String,
    value: @Composable () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(label, Modifier.padding(end = 16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 20.sp)
        value()
    }
}

@Composable
private fun SectionLabel(
    title: String,
    count: Int? = null,
) {
    Row(
        Modifier.padding(bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title.uppercase(),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.1.em,
            fontWeight = FontWeight.Medium,
        )
        count?.let { Text("$it", color = documentTokens().faint, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp) }
    }
}

/** Uma linha por tarefa: o ícone do tipo, o nome, a relação (o código do contrato) e quando a tarefa começa; leva ao detalhe dela. */
@Composable
private fun TasksSection(
    artifact: Artifact,
    now: Instant,
    onOpenTask: (String) -> Unit,
) {
    Column {
        SectionLabel("Tarefas", artifact.tasks.size.takeIf { it > 1 })
        artifact.tasks.forEach { link ->
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            TaskLinkRow(link, now, onClick = { onOpenTask(link.taskId) })
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun TaskLinkRow(
    link: ArtifactTaskLink,
    now: Instant,
    onClick: () -> Unit,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val sub = link.relation + (link.startedAt?.let { " · ${whenLabel(it, now)}" } ?: "")
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick).padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SvgIcon(BraidIcons.taskKind(link.kind.code), size = 20.dp, color = muted, modifier = Modifier.clearAndSetSemantics {})
        Column(Modifier.weight(1f)) {
            Text(
                link.name,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(sub, color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp)
        }
        SvgIcon(BraidIcons.chevronRight, size = 18.dp, color = muted, modifier = Modifier.clearAndSetSemantics {})
    }
}

@Composable
private fun RecordSection(
    artifact: Artifact,
    now: Instant,
) {
    Column {
        SectionLabel("Registro")
        FactRow("Criado", whenLabel(artifact.createdAt, now))
        FactRow("Última alteração", whenLabel(artifact.updatedAt, now))
    }
}
