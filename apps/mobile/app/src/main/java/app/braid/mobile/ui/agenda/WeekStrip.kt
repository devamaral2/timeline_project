package app.braid.mobile.ui.agenda

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.timeline.dayNumber
import app.braid.mobile.domain.timeline.longDate
import app.braid.mobile.domain.timeline.weekOf
import app.braid.mobile.domain.timeline.weekday

/** A cor do texto de apoio sobre o dia escolhido (`--on-primary-muted`). */
@Composable
internal fun onPrimaryMuted(): Color = lerp(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.onPrimary, 0.7f)

internal fun dayDescription(
    dayKey: String,
    todayKey: String,
): String = if (dayKey == todayKey) "${longDate(dayKey)}, hoje" else longDate(dayKey)

/**
 * A régua de datas da agenda: os sete dias da semana do dia em foco, de domingo
 * a sábado. O dia escolhido é preenchido em `primary`; hoje leva o ponto da marca
 * embaixo do número.
 */
@Composable
fun WeekStrip(
    selectedDay: String,
    todayKey: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (dayKey in weekOf(selectedDay)) {
            WeekDay(
                dayKey = dayKey,
                isToday = dayKey == todayKey,
                isSelected = dayKey == selectedDay,
                description = dayDescription(dayKey, todayKey),
                onClick = { onSelect(dayKey) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun WeekDay(
    dayKey: String,
    isToday: Boolean,
    isSelected: Boolean,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val background by animateColorAsState(if (isSelected) scheme.primary else Color.Transparent, label = "weekDayBackground")
    val numberColor =
        when {
            isSelected -> scheme.onPrimary
            isToday -> tokens.brandAccent
            else -> scheme.onBackground
        }
    val dotColor =
        when {
            isSelected && isToday -> tokens.onPrimaryBrand
            isToday -> tokens.brand
            else -> Color.Transparent
        }
    Column(
        modifier =
            modifier
                .clip(RoundedCornerShape(15.dp))
                .background(background)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics {
                    contentDescription = description
                    selected = isSelected
                }.padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = weekday(dayKey).take(3).uppercase(),
            color = if (isSelected) onPrimaryMuted() else scheme.onSurfaceVariant,
            fontFamily = BraidMonoFont,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            letterSpacing = 0.04.em,
        )
        Text(
            text = dayNumber(dayKey),
            color = numberColor,
            fontSize = 16.sp,
            lineHeight = 22.sp,
            fontWeight = if (isSelected || isToday) FontWeight.Bold else FontWeight.Medium,
        )
        Box(Modifier.size(4.dp).background(dotColor, CircleShape))
    }
}
