package app.braid.mobile.ui.agenda

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.agenda.FreeSlot
import app.braid.mobile.domain.agenda.freeWindowGrade
import java.time.Instant

private val Plus = listOf(SvgPart("M5 12h14"), SvgPart("M12 5v14"))

/**
 * Uma janela livre: uma linha com o quadrado tracejado e o "+", a faixa de horas e a duração. A cor anda na régua
 * de [freeWindowGrade] (apagada aos 15 minutos, verde-água dali em diante). Tocar entrega a janela à tela, que a
 * leva ao chat (ticket 12). Uma janela que já passou fica mais fraca.
 */
@Composable
fun FreeTimeRow(
    slot: FreeSlot,
    now: Instant,
    onPlan: () -> Unit,
) {
    val tokens = braidTokens()
    val grade = freeWindowGrade(slot.minutes)
    val faint = MaterialTheme.colorScheme.outline
    val tone = lerp(lerp(faint, tokens.brand, grade.low / PERCENT), tokens.brandAccent, grade.high / PERCENT)
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val passed = now.toEpochMilli() >= slot.endMs
    val start = freeStartLabel(slot)
    val end = freeEndLabel(slot)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clickable(role = Role.Button, onClick = onPlan)
                .semantics(mergeDescendants = true) { contentDescription = "Planejar com o Hermes a janela livre das $start às $end" }
                .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(24.dp).dashedFrame(tone), contentAlignment = Alignment.Center) {
            SvgIcon(Plus, size = 14.dp, color = tone, strokeWidth = 1.75f)
        }
        Column(Modifier.weight(1f).clearAndSetSemantics {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = if (slot.endsAtMidnight) "Livre até o fim do dia" else "Livre",
                color = if (passed) muted.copy(alpha = PASSED_ALPHA) else muted,
                fontSize = 16.sp,
                lineHeight = 22.sp,
            )
            Text(text = freeRangeLabel(slot), color = muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
        Text(
            text = freeDurationLabel(slot.minutes),
            modifier = Modifier.clearAndSetSemantics {},
            color = tone,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 18.sp,
            maxLines = 1,
        )
    }
}

private const val PERCENT = 100f
private const val PASSED_ALPHA = 0.7f

private fun Modifier.dashedFrame(color: Color): Modifier =
    drawBehind {
        drawRoundRect(
            color = color,
            cornerRadius = CornerRadius(7.dp.toPx()),
            style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))),
        )
    }
