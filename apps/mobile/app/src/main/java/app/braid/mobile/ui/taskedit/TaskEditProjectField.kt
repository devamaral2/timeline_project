package app.braid.mobile.ui.taskedit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.ProjectLine
import app.braid.mobile.core.designsystem.ProjectMark
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.project.Project
import app.braid.mobile.ui.picker.EntityPickerSheet

/**
 * A linha "Projeto" de Informações, na criação e na edição: a marca e o nome do projeto num campo que abre a escolha.
 * Sem escolha mostra `diario`, o padrão. A troca só mexe no rascunho; a gravação fica para o Salvar.
 */
@Composable
internal fun ProjectRow(
    project: Project?,
    onOpen: () -> Unit,
) {
    val shown = project ?: Project.Personal
    EditRow("Projeto") {
        Row(
            Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp)
                .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outline), CircleShape)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(horizontal = 16.dp)
                .semantics { contentDescription = "Projeto: ${shown.name}. Trocar" },
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProjectMark(shown)
            Text(
                text = shown.name,
                modifier = Modifier.weight(1f).clearAndSetSemantics {},
                color = MaterialTheme.colorScheme.onBackground,
                fontFamily = BraidMonoFont,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            SvgIcon(
                BraidIcons.chevronDown,
                size = 16.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
    }
}

/** A folha de escolha do projeto, quando aberta: a lista, a busca e o rodapé que cria um projeto com o texto da busca. */
@Composable
internal fun ProjectPickerHost(picker: TaskProjectPicker) {
    val open by picker.state.collectAsStateWithLifecycle()
    val sheet = open ?: return
    EntityPickerSheet(
        title = "Projeto",
        searchLabel = "Buscar projeto",
        state = sheet.search,
        failedMessage = PROJECT_SEARCH_FAILED,
        keyOf = { it.id },
        nameOf = { it.name },
        onType = picker::type,
        onPick = picker::pick,
        onClose = picker::close,
        footer = { ProjectCreateFooter(text = sheet.search.typed.trim(), footer = sheet.footer, onCreate = picker::create) },
    ) { project -> ProjectLine(project) }
}

/** O rodapé da folha: "Criar “texto”". O projeto nasce na hora, como a tarefa criada pelo seletor de tarefas. */
@Composable
private fun ProjectCreateFooter(
    text: String,
    footer: ProjectFooter,
    onCreate: () -> Unit,
) {
    val creating = footer is ProjectFooter.Creating
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FooterAction(
            label = if (text.isEmpty()) "Criar projeto" else "Criar “$text”",
            enabled = text.isNotEmpty() && !creating,
            onClick = onCreate,
        ) {
            SvgIcon(
                if (creating) BraidIcons.spinner else BraidIcons.plus,
                size = 16.dp,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.clearAndSetSemantics {},
            )
        }
        when {
            text.isEmpty() && !creating -> Hint(PROJECT_CREATE_HINT)
            footer is ProjectFooter.Failed -> Hint(footer.message, alert = true)
        }
    }
}
