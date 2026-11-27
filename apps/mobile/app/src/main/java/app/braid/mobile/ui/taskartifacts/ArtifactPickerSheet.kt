package app.braid.mobile.ui.taskartifacts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.ui.picker.EntityPickerSheet

const val GLOBAL_CATALOG_LABEL = "catálogo global"
const val OWN_DOCUMENT_LABEL = "seu artefato"

/**
 * A folha de seleção de artefatos da tarefa, com o título e os textos da fonte do tipo da tarefa (alimentos, exercícios
 * ou os artefatos do usuário). Cada escolha mostra o nome, o tipo, de quem é e, no alimento, as calorias.
 */
@Composable
fun ArtifactPickerSheet(
    picker: ArtifactPicker,
    onType: (String) -> Unit,
    onPick: (Artifact) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    EntityPickerSheet(
        title = picker.source.title,
        searchLabel = picker.source.searchLabel,
        state = picker.search,
        failedMessage = picker.source.failedMessage,
        keyOf = { it.id },
        nameOf = { it.name },
        onType = onType,
        onPick = onPick,
        onClose = onClose,
        modifier = modifier,
    ) { artifact -> ArtifactChoice(artifact) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ArtifactChoice(artifact: Artifact) {
    Text(
        artifact.name,
        color = MaterialTheme.colorScheme.onBackground,
        fontSize = 15.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.SemiBold,
    )
    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Code(artifact.type.code)
        Muted(if (artifact.global) GLOBAL_CATALOG_LABEL else OWN_DOCUMENT_LABEL)
        (artifact.data as? FoodData)?.let { Muted("${Math.round(it.totals.calories)} kcal") }
    }
}

/** O código do contrato em mono (`text`, `uses`): a tela o mostra como está. */
@Composable
internal fun Code(text: String) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 20.sp)
}

@Composable
internal fun Muted(text: String) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
}
