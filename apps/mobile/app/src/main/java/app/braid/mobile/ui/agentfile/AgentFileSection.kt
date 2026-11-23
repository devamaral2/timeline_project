package app.braid.mobile.ui.agentfile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.domain.agentfile.AgentFileBackup
import app.braid.mobile.domain.agentfile.backupSizeLabel
import app.braid.mobile.domain.agentfile.backupWhenLabel
import app.braid.mobile.domain.agentfile.fileVersion
import app.braid.mobile.domain.agentfile.splitFrontmatter
import app.braid.mobile.domain.artifact.AgentFileData
import app.braid.mobile.ui.aiedit.AiEditBar
import app.braid.mobile.ui.aiedit.AiEditBarActions
import app.braid.mobile.ui.aiedit.AiEditBarModel
import app.braid.mobile.ui.aiedit.AiEditContext
import app.braid.mobile.ui.aiedit.MicrophonePermissionEffect
import app.braid.mobile.ui.documents.MarkdownView
import app.braid.mobile.ui.taskdetail.DetailIcons

/**
 * O arquivo de uma skill ou agente do Hermes dentro do documento: caminho, versão, aviso de arquivo ausente e
 * descrição; para o dono, o texto em markdown ou cru, os backups (com restauração) e o campo de pedir uma edição ao
 * Hermes. Quem não é o dono vê só o cabeçalho: sem texto, backups, campo nem erro.
 */
@Composable
fun AgentFileSection(
    file: AgentFileData,
    modifier: Modifier = Modifier,
    viewModel: AgentFileViewModel =
        hiltViewModel<AgentFileViewModel, AgentFileViewModel.Factory>(key = file.path) { it.create(file) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(viewModel) {
        viewModel.setVisible(true)
        onPauseOrDispose { viewModel.setVisible(false) }
    }
    MicrophonePermissionEffect(state.edit.voice.askPermission, viewModel::microphoneResult)
    AgentFileContent(
        state = state,
        description = file.description,
        actions =
            AgentFileActions(
                onRaw = viewModel::setRaw,
                onAskRestore = viewModel::askRestore,
                onCancelRestore = viewModel::cancelRestore,
                onConfirmRestore = viewModel::confirmRestore,
                onDraftChange = viewModel::onDraftChange,
                onSend = viewModel::send,
                onDismiss = viewModel::dismiss,
                onToggleVoice = viewModel::toggleVoice,
            ),
        modifier = modifier,
    )
}

class AgentFileActions(
    val onRaw: (Boolean) -> Unit,
    val onAskRestore: (AgentFileBackup) -> Unit,
    val onCancelRestore: () -> Unit,
    val onConfirmRestore: () -> Unit,
    val onDraftChange: (String) -> Unit,
    val onSend: () -> Unit,
    val onDismiss: () -> Unit,
    val onToggleVoice: () -> Unit = {},
)

@Composable
fun AgentFileContent(
    state: AgentFileUiState,
    description: String?,
    actions: AgentFileActions,
    modifier: Modifier = Modifier,
) {
    Column(modifier.semantics { contentDescription = "Arquivo do Hermes" }, verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Header(state, description)
        FileBody(state, actions.onRaw)
        if (state.read is FileRead.Ready || state.read == FileRead.Error) BackupsSection(state, actions.onAskRestore)
        if (!state.forbidden) EditSection(state.path, state.edit, actions)
    }
    state.restore?.let { RestoreConfirmation(it, actions.onCancelRestore, actions.onConfirmRestore) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Header(
    state: AgentFileUiState,
    description: String?,
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(state.path, color = muted, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 18.sp)
            Text(
                buildAnnotatedString {
                    append("versão ")
                    withStyle(SpanStyle(fontFamily = BraidMonoFont)) { append(fileVersion(state.hash)) }
                },
                color = muted,
                fontSize = 12.sp,
                lineHeight = 18.sp,
            )
        }
        if (state.missing) {
            Text(
                "O arquivo não está mais na pasta: este é o último texto conhecido.",
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
        description?.takeIf { it.isNotEmpty() }?.let {
            Text(it, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, lineHeight = 22.sp)
        }
    }
}

@Composable
private fun StatusMessage(
    text: String,
    alert: Boolean = false,
) {
    Text(
        text,
        modifier = Modifier.semantics { liveRegion = if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        color = if (alert) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
}

@Composable
private fun FileBody(
    state: AgentFileUiState,
    onRaw: (Boolean) -> Unit,
) {
    when (val read = state.read) {
        FileRead.Forbidden -> Unit
        FileRead.Error -> StatusMessage(FILE_READ_FAILED_TEXT, alert = true)
        FileRead.Loading -> StatusMessage("Lendo o arquivo…")
        is FileRead.Ready -> {
            ModeToggle(state.raw, onRaw)
            if (state.raw) {
                Text(
                    read.text,
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Texto do arquivo" },
                    color = MaterialTheme.colorScheme.onBackground,
                    fontFamily = BraidMonoFont,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
            } else {
                RenderedFile(read.text)
            }
        }
    }
}

@Composable
private fun ModeToggle(
    raw: Boolean,
    onRaw: (Boolean) -> Unit,
) {
    Row(
        Modifier.semantics { contentDescription = "Modo de exibição" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ModeButton("Markdown", selected = !raw) { onRaw(false) }
        ModeButton("Texto bruto", selected = raw) { onRaw(true) }
    }
}

@Composable
private fun ModeButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        onClick = onClick,
        modifier = Modifier.defaultMinSize(minHeight = 40.dp).semantics { this.selected = selected },
        shape = CircleShape,
        color = if (selected) scheme.onBackground else Color.Transparent,
        border = BorderStroke(1.dp, if (selected) scheme.onBackground else scheme.outline),
    ) {
        Box(Modifier.defaultMinSize(minHeight = 40.dp).padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
            Text(
                label,
                color = if (selected) scheme.background else scheme.onBackground,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/** O cabeçalho `---` do arquivo como sumário e o resto em markdown. */
@Composable
private fun RenderedFile(text: String) {
    val file = remember(text) { splitFrontmatter(text) }
    Column(Modifier.semantics { contentDescription = "Texto do arquivo" }, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (file.summary.isNotEmpty()) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp)
                    .semantics { contentDescription = "Sumário do arquivo" },
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                file.summary.forEach { line ->
                    Text(
                        buildAnnotatedString {
                            if (line.key != null) {
                                withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurfaceVariant)) { append("${line.key}:") }
                                line.value?.let { append(" $it") }
                            } else {
                                append(line.line)
                            }
                        },
                        color = MaterialTheme.colorScheme.onBackground,
                        fontFamily = BraidMonoFont,
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    )
                }
            }
        }
        if (file.body.isNotBlank()) MarkdownView(file.body)
    }
}

@Composable
private fun SectionLabel(
    title: String,
    count: Int?,
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

@Composable
private fun BackupsSection(
    state: AgentFileUiState,
    onAskRestore: (AgentFileBackup) -> Unit,
) {
    val backups = state.backups
    Column {
        SectionLabel("Backups", (backups as? BackupsState.Ready)?.backups?.size)
        when (backups) {
            BackupsState.Idle, BackupsState.Loading -> StatusMessage("Carregando backups…")
            BackupsState.Error -> StatusMessage(BACKUPS_FAILED_TEXT, alert = true)
            is BackupsState.Ready ->
                if (backups.backups.isEmpty()) {
                    StatusMessage("Nenhum backup ainda.")
                } else {
                    backups.backups.forEach { backup ->
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        BackupRow(backup) { onAskRestore(backup) }
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                }
        }
    }
}

@Composable
private fun BackupRow(
    backup: AgentFileBackup,
    onRestore: () -> Unit,
) {
    val whenLabel = backupWhenLabel(backup.createdAt)
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 56.dp).padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                whenLabel,
                color = MaterialTheme.colorScheme.onBackground,
                fontSize = 15.sp,
                lineHeight = 22.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                backupSizeLabel(backup.sizeBytes),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = BraidMonoFont,
                fontSize = 12.sp,
                lineHeight = 18.sp,
            )
        }
        Text(
            "Restaurar",
            modifier =
                Modifier
                    .clip(CircleShape)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    .clickable(role = Role.Button, onClick = onRestore)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
                    .semantics { contentDescription = "Restaurar backup de $whenLabel" },
            color = MaterialTheme.colorScheme.onBackground,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun RestoreConfirmation(
    dialog: RestoreDialog,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onCancel,
        containerColor = MaterialTheme.colorScheme.background,
        icon = { SvgIcon(DetailIcons.alertTriangle, size = 24.dp, color = MaterialTheme.colorScheme.onBackground) },
        title = { Text("Restaurar backup", style = MaterialTheme.typography.headlineSmall) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "O texto atual do arquivo será substituído pelo backup de ${backupWhenLabel(dialog.backup.createdAt)}. " +
                        "O texto atual fica guardado como um backup novo, então a restauração pode ser desfeita.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    lineHeight = 22.sp,
                )
                dialog.error?.let { StatusMessage(it, alert = true) }
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel, enabled = !dialog.busy) { Text("Cancelar", color = MaterialTheme.colorScheme.onBackground) }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !dialog.busy) {
                Text(if (dialog.busy) "Restaurando..." else "Restaurar", color = MaterialTheme.colorScheme.onBackground)
            }
        },
    )
}

@Composable
private fun EditSection(
    path: String,
    bar: EditBar,
    actions: AgentFileActions,
) {
    if (bar.hermesOff) {
        Text(
            HERMES_OFF_TEXT,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        return
    }
    AiEditBar(
        model =
            AiEditBarModel(
                draft = bar.draft,
                placeholder = "Peça uma mudança neste arquivo",
                fieldLabel = "Pedir ao Hermes uma edição neste arquivo",
                statusText = bar.statusText,
                context = AiEditContext(BraidIcons.fileText, "Pedido de edição", path.substringAfterLast('/')),
                locked = bar.busy,
                canSend = bar.canSend,
                busy = bar.busy,
                canDismiss = bar.canDismiss,
                message = bar.shown,
                failed = bar.hasFailure,
                messageAlert = bar.error != null,
                voice = bar.voice,
            ),
        actions =
            AiEditBarActions(
                onDraftChange = actions.onDraftChange,
                onSend = actions.onSend,
                onDismiss = actions.onDismiss,
                onToggleVoice = actions.onToggleVoice,
            ),
    )
}
