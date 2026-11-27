package app.braid.mobile.ui.taskartifacts

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.documentTokens
import app.braid.mobile.domain.artifact.FoodData
import app.braid.mobile.domain.artifact.FoodGeneration
import app.braid.mobile.domain.artifact.formatDecimal
import app.braid.mobile.domain.artifact.macroShares
import app.braid.mobile.ui.documents.MealContent
import app.braid.mobile.ui.documents.RecipeView

const val TASK_MEAL_FOOTNOTE = "Estimativa nutricional da IA"

/**
 * O alimento (ou a refeição) dentro do cartão do artefato, no detalhe da tarefa (`TaskMealContent` do web): em cima, as
 * calorias à esquerda e os macros em lista à direita, com a barra de proporção embaixo; depois os alimentos, que recolhem
 * pela linha "Alimentos"; a receita, quando há; e o aviso de que os números são estimativa da IA. Enquanto o agente calcula,
 * ou se falhou, só o texto digitado e o aviso do artefato.
 */
@Composable
fun TaskMealContent(
    data: FoodData,
    modifier: Modifier = Modifier,
) {
    if (data.generation == FoodGeneration.Pending || data.generation == FoodGeneration.Failed) {
        MealContent(data, modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp))
        return
    }
    val tokens = documentTokens()
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val (protein, carbohydrates, fat) = macroShares(data.totals)
    val macros =
        listOf(
            Triple("Proteínas", data.totals.proteinGrams to protein, tokens.protein),
            Triple("Carboidratos", data.totals.carbohydrateGrams to carbohydrates, tokens.carbohydrates),
            Triple("Gorduras", data.totals.fatGrams to fat, tokens.fat),
        )
    val kcal = formatDecimal(data.totals.calories)
    var foodsOpen by rememberSaveable { mutableStateOf(true) }
    Column(modifier.padding(bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (data.description.isNotEmpty() && data.items.isEmpty()) {
                Text(data.description, color = MaterialTheme.colorScheme.onBackground, fontSize = 15.sp, lineHeight = 22.sp)
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = "$kcal quilocalorias consumidas" }) {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            kcal,
                            color = MaterialTheme.colorScheme.onBackground,
                            fontFamily = BraidDisplayFont,
                            fontSize = 36.sp,
                            lineHeight = 40.sp,
                            maxLines = 1,
                        )
                        Text("kcal", color = muted, fontSize = 13.sp, lineHeight = 24.sp)
                    }
                    Text("consumidas", color = muted, fontSize = 13.sp, lineHeight = 20.sp)
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    macros.forEach { (name, grams, color) ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(8.dp).background(color, CircleShape))
                            Text(name, Modifier.weight(1f), color = muted, fontSize = 13.sp, lineHeight = 20.sp, maxLines = 1)
                            Text(
                                "${formatDecimal(grams.first)} g",
                                color = MaterialTheme.colorScheme.onBackground,
                                fontSize = 13.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
            if (protein + carbohydrates + fat > 0) {
                Row(
                    Modifier.fillMaxWidth().height(4.dp).semantics {
                        contentDescription =
                            "De onde vêm as calorias: " + macros.joinToString(", ") { (name, g, _) -> "${name.lowercase()} ${g.second}%" }
                    },
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    macros.forEach { (_, grams, color) ->
                        Box(
                            Modifier
                                .weight(grams.second.toFloat().coerceAtLeast(MIN_SEGMENT_WEIGHT))
                                .height(4.dp)
                                .background(color, RoundedCornerShape(2.dp)),
                        )
                    }
                }
            }
        }
        if (data.items.isNotEmpty()) {
            Column {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .clickable(role = Role.Button) { foodsOpen = !foodsOpen }
                        .semantics { stateDescription = if (foodsOpen) "Aberto" else "Fechado" }
                        .padding(horizontal = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("ALIMENTOS", color = tokens.faint, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp)
                    Text("${data.items.size}", color = tokens.faint, fontFamily = BraidMonoFont, fontSize = 12.sp, lineHeight = 16.sp)
                    Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                        SvgIcon(
                            BraidIcons.chevronDown,
                            size = 16.dp,
                            color = tokens.faint,
                            modifier = Modifier.rotate(if (foodsOpen) CHEVRON_OPEN else 0f).clearAndSetSemantics {},
                        )
                    }
                }
                if (foodsOpen) {
                    data.items.forEach { food ->
                        HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = MaterialTheme.colorScheme.outline)
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    food.name,
                                    color = MaterialTheme.colorScheme.onBackground,
                                    fontSize = 15.sp,
                                    lineHeight = 22.sp,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    food.portion.ifEmpty { "${formatDecimal(food.weightGrams)} g" },
                                    color = muted,
                                    fontSize = 13.sp,
                                    lineHeight = 20.sp,
                                )
                            }
                            Text(
                                "${formatDecimal(food.calories)} kcal",
                                color = MaterialTheme.colorScheme.onBackground,
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                            )
                        }
                    }
                }
            }
        }
        data.recipe?.let { Box(Modifier.padding(horizontal = 14.dp)) { RecipeView(it) } }
        if (data.modelEstimate) {
            Text(
                TASK_MEAL_FOOTNOTE,
                Modifier.padding(horizontal = 14.dp),
                color = muted,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
    }
}

private const val MIN_SEGMENT_WEIGHT = 0.01f
private const val CHEVRON_OPEN = 180f
