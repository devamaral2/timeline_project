package app.braid.mobile.ui.agenda

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidSansFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.agenda.FreeSlot
import app.braid.mobile.domain.agenda.freeWindowGrade
import app.braid.mobile.domain.time.hoursAndMinutes

private val Plus = listOf(SvgPart("M5 12h14"), SvgPart("M12 5v14"))

/**
 * Uma janela livre, com o desenho do web (`.freeRow` de `agenda.module.css`): o quadrado tracejado de 44 com o "+",
 * "Livre" e a faixa de horas, e a duração em destaque na serifa. A cor anda na régua de [freeWindowGrade] (apagada
 * aos 15 minutos, verde-água dali em diante). Tocar entrega a janela à tela, que a leva ao chat (ticket 12).
 */
@Composable
fun FreeTimeRow(
    slot: FreeSlot,
    onPlan: () -> Unit,
) {
    val tokens = braidTokens()
    val grade = freeWindowGrade(slot.minutes)
    val faint = MaterialTheme.colorScheme.outline
    val tone = lerp(lerp(faint, tokens.brand, grade.low / PERCENT), tokens.brandAccent, grade.high / PERCENT)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val start = freeStartLabel(slot)
    val end = freeEndLabel(slot)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clickable(role = Role.Button, onClick = onPlan)
                .semantics(mergeDescendants = true) { contentDescription = "Planejar com o Hermes a janela livre das $start às $end" }
                .padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).dashedFrame(tone), contentAlignment = Alignment.Center) {
            SvgIcon(Plus, size = 20.dp, color = tone, strokeWidth = 1.75f)
        }
        Column(Modifier.weight(1f).clearAndSetSemantics {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = if (slot.endsAtMidnight) "Livre até o fim do dia" else "Livre",
                color = muted,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = 24.sp,
            )
            Text(
                text = freeRangeLabel(slot),
                color = muted,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
            )
        }
        DurationFigure(slot.minutes, tone, muted, Modifier.clearAndSetSemantics {})
    }
}

/** As horas e os minutos na serifa, na cor da janela, com a unidade pequena ao lado (o `DurationFigure` do web). */
@Composable
private fun DurationFigure(
    minutes: Int,
    tone: Color,
    muted: Color,
    modifier: Modifier = Modifier,
) {
    val (hours, rest) = hoursAndMinutes(minutes)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        if (hours > 0) {
            Figure(hours, tone)
            UnitLabel("h", muted)
        }
        if (rest > 0) {
            Figure(rest, tone, Modifier.padding(start = if (hours > 0) 4.dp else 0.dp))
            UnitLabel("min", muted)
        }
    }
}

@Composable
private fun RowScope.Figure(
    value: Int,
    tone: Color,
    modifier: Modifier = Modifier,
) {
    Text(
        text = value.toString(),
        modifier = modifier.alignByBaseline(),
        color = tone,
        fontFamily = BraidDisplayFont,
        fontSize = 22.sp,
        lineHeight = 24.sp,
        style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"),
        maxLines = 1,
    )
}

@Composable
private fun RowScope.UnitLabel(
    text: String,
    muted: Color,
) {
    Text(
        text = text,
        modifier = Modifier.alignByBaseline(),
        color = muted,
        fontFamily = BraidSansFont,
        fontSize = 12.sp,
        maxLines = 1,
    )
}

private const val PERCENT = 100f

private fun Modifier.dashedFrame(color: Color): Modifier =
    drawBehind {
        drawRoundRect(
            color = color,
            cornerRadius = CornerRadius(13.dp.toPx()),
            style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))),
        )
    }
