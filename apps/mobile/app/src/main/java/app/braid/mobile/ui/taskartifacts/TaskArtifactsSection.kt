package app.braid.mobile.ui.taskartifacts

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.TEXT_BODY_ARTIFACT_TYPES
import app.braid.mobile.domain.task.ArtifactSource
import app.braid.mobile.domain.task.TaskArtifact
import app.braid.mobile.domain.task.TaskKind
import app.braid.mobile.domain.task.artifactPositions
import app.braid.mobile.domain.task.mealCaloriesKcal
import app.braid.mobile.ui.documents.ArtifactContent
import app.braid.mobile.ui.documents.DocumentIcons
import app.braid.mobile.ui.taskdetail.Section
import app.braid.mobile.ui.taskedit.AddButton

/**
 * Os tipos cujo conteúdo aparece inteiro dentro da tarefa: texto, roteador, alimento, treino e sono. Skill e agente
 * ficam só no cabeçalho (o arquivo do Hermes tem leitura e edição no detalhe do artefato), e o exercício do catálogo
 * também.
 */
private val INLINE_TYPES = TEXT_BODY_ARTIFACT_TYPES + setOf(ArtifactType.Food, ArtifactType.Training, ArtifactType.Sleep)

/**
 * A seção Artefatos do detalhe: os artefatos da tarefa, na ordem da API. Cada um é um cartão com o ícone do tipo, o
 * nome (que abre o detalhe do artefato) e, em mono, a posição, o código do tipo e a relação (`1 · text · uses`); o que
 * a tarefa criou não tem posição. "catálogo global" aparece só no do catálogo. Dentro vem o conteúdo, aberto, que a seta
 * recolhe. Na refeição o rodapé soma as calorias dos alimentos. Com [onAdd] a seção aparece sempre, com a ação que abre o
 * seletor do tipo da tarefa; sem ele e sem artefatos, não aparece.
 */
@Composable
fun TaskArtifactsSection(
    kind: TaskKind,
    artifacts: List<TaskArtifact>,
    onOpenArtifact: (String) -> Unit,
    onAdd: (() -> Unit)?,
    busy: Boolean,
    /** Na Leitura diária, o "Adicionar vídeo" (pede a transcrição de um vídeo do YouTube) sob o "+" dos artefatos. */
    video: (@Composable () -> Unit)? = null,
) {
    if (artifacts.isEmpty() && onAdd == null) return
    val positions = artifactPositions(artifacts.map { it.relation })
    Section("Artefatos", artifacts.size.toString()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            artifacts.forEachIndexed { index, link ->
                androidx.compose.runtime.key(link.artifact.id) { ArtifactCard(link, positions[index], onOpenArtifact) }
            }
            if (onAdd != null) {
                Box(Modifier.alpha(if (busy) BUSY_ALPHA else 1f)) {
                    AddButton(ArtifactSource.of(kind).addLabel, onClick = { if (!busy) onAdd() })
                }
            }
            video?.invoke()
            if (kind == TaskKind.Meal && artifacts.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Total de calorias", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 20.sp)
                    Text(
                        "${Math.round(mealCaloriesKcal(artifacts))} kcal",
                        color = MaterialTheme.colorScheme.onBackground,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

private const val BUSY_ALPHA = 0.5f

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ArtifactCard(
    link: TaskArtifact,
    position: Int?,
    onOpenArtifact: (String) -> Unit,
) {
    val artifact = link.artifact
    val hasContent = artifact.type in INLINE_TYPES
    var open by rememberSaveable(artifact.id) { mutableStateOf(true) }
    val outline = MaterialTheme.colorScheme.outline
    Column(Modifier.fillMaxWidth().border(1.dp, outline, RoundedCornerShape(CARD_RADIUS.dp)).clip(RoundedCornerShape(CARD_RADIUS.dp))) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            SvgIcon(
                DocumentIcons.glyph(artifact.type),
                size = 20.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clearAndSetSemantics {},
            )
            Column(
                Modifier
                    .weight(1f)
                    .clickable(role = Role.Button) { onOpenArtifact(artifact.id) }
                    .defaultMinSize(minHeight = 48.dp)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    artifact.name,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        listOfNotNull(position?.toString(), artifact.type.code, link.relation.code).joinToString(" · "),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontSize = 12.sp,
                        lineHeight = 20.sp,
                    )
                    if (artifact.global) Muted(GLOBAL_CATALOG_LABEL)
                }
            }
            if (hasContent) {
                val label = "${if (open) "Recolher" else "Estender"} o conteúdo de ${artifact.name}"
                Box(
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .clickable(role = Role.Button) { open = !open }
                        .semantics {
                            contentDescription = label
                            stateDescription = if (open) "Aberto" else "Fechado"
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    SvgIcon(
                        BraidIcons.chevronDown,
                        size = 18.dp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.rotate(if (open) CHEVRON_OPEN else 0f).clearAndSetSemantics {},
                    )
                }
            }
        }
        if (hasContent && open) ArtifactBody(artifact)
    }
}

private const val CARD_RADIUS = 12
private const val CHEVRON_OPEN = 180f

/** O conteúdo do cartão: o alimento no desenho próprio da tarefa, os demais com o componente do detalhe do artefato. */
@Composable
private fun ArtifactBody(artifact: Artifact) {
    val food = artifact.data as? FoodData
    if (food != null) {
        TaskMealContent(food)
    } else {
        ArtifactContent(artifact, Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp))
    }
}
