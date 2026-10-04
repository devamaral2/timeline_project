package app.braid.mobile.ui.agenda

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand

/**
 * As quatro entradas da barra inferior, na mesma ordem e com os mesmos ícones
 * do `bottomNav` de `mockups/eventos/mobile-navigation.tsx`: Tarefas, Agenda,
 * Notas e “Buscar e criar”.
 */
enum class BottomBarItem(
    val label: String,
) {
    Tasks("Tarefas"),
    Agenda("Agenda"),
    Notes("Notas"),
    Search("Buscar e criar"),
}

/**
 * Barra inferior como a do web no celular: só ícones (os rótulos vão para a
 * acessibilidade), fio no topo, o item ativo em tinta cheia com um ponto da cor
 * da marca embaixo, e “Buscar e criar” sempre na cor da marca.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaBottomBar(
    selected: BottomBarItem,
    onSelect: (BottomBarItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background),
    ) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        Row(
            modifier =
                Modifier
                    .windowInsetsPadding(WindowInsets.navigationBars)
                    .padding(horizontal = 24.dp, vertical = 8.dp)
                    .height(60.dp)
                    .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BottomBarItem.entries.forEach { item ->
                BottomBarButton(
                    modifier = Modifier.weight(1f),
                    item = item,
                    selected = selected == item,
                    onClick = { onSelect(item) },
                )
            }
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun BottomBarButton(
    item: BottomBarItem,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val tint =
        when {
            item == BottomBarItem.Search -> braidBrand()
            selected -> colors.onBackground
            else -> colors.onSurfaceVariant
        }
    Box(
        modifier =
            modifier
                .height(60.dp)
                .clip(MaterialTheme.shapes.large)
                .semantics {
                    role = Role.Tab
                    this.selected = selected
                    contentDescription = item.label
                }.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClick,
                ),
        contentAlignment = Alignment.Center,
    ) {
        if (item == BottomBarItem.Search) {
            IntelligenceGlyph(tint = tint, modifier = Modifier.size(30.dp))
        } else {
            Icon(
                imageVector = item.vector(),
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(25.dp),
            )
        }
        if (selected) {
            Box(
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 4.dp)
                        .size(4.dp)
                        .clip(CircleShape)
                        .background(braidBrand()),
            )
        }
    }
}

/** O ponto com ondas de `IntelligenceIcon`, parado como no `prefers-reduced-motion` do web. */
@Composable
@Suppress("ktlint:standard:function-naming")
private fun IntelligenceGlyph(
    tint: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val unit = size.width / 24f
        val center = center
        drawCircle(color = tint, radius = 2.4f * unit, center = center)
        val dashes = PathEffect.dashPathEffect(floatArrayOf(1.1f * unit * 1.5f, 1.7f * unit * 1.5f))
        listOf(5f to 1f, 8f to 0.45f).forEach { (radius, alpha) ->
            drawCircle(
                color = tint.copy(alpha = alpha),
                radius = radius * unit,
                center = center,
                style = Stroke(width = 1.5f * unit, cap = StrokeCap.Round, pathEffect = dashes),
            )
        }
    }
}

private fun BottomBarItem.vector(): ImageVector =
    when (this) {
        BottomBarItem.Tasks -> LucideIcons.squareCheck(LucideIcons.NAV_STROKE)
        BottomBarItem.Agenda -> LucideIcons.calendarDays(LucideIcons.NAV_STROKE)
        BottomBarItem.Notes -> LucideIcons.notepadText(LucideIcons.NAV_STROKE)
        BottomBarItem.Search -> error("A busca desenha o próprio glifo")
    }
