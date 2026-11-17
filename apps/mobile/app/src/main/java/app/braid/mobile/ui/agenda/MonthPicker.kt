package app.braid.mobile.ui.agenda

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.braidTokens
import app.braid.mobile.domain.timeline.briefDate
import app.braid.mobile.domain.timeline.dayNumber
import app.braid.mobile.domain.timeline.isSameMonth
import app.braid.mobile.domain.timeline.monthGridOf
import app.braid.mobile.domain.timeline.shiftMonthKey
import app.braid.mobile.domain.timeline.weekOf
import app.braid.mobile.domain.timeline.weekday

/** O botão com o nome do mês: abre o seletor fechado, fecha o aberto. */
@Composable
fun MonthToggle(
    label: String,
    expanded: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .height(40.dp)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(text = label, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        SvgIcon(
            BraidIcons.chevronDown,
            size = 14.dp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.rotate(if (expanded) 180f else 0f),
        )
    }
}

/**
 * O mês aberto: um cartão com as setas, a grade de seis semanas e o atalho
 * "Hoje". Navegar de mês não muda o dia escolhido; tocar num dia o escolhe.
 */
@Composable
fun MonthPicker(
    selectedDay: String,
    todayKey: String,
    onSelect: (String) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var browsing by rememberSaveable { mutableStateOf(selectedDay) }
    val scheme = MaterialTheme.colorScheme

    Surface(
        modifier = modifier.fillMaxWidth().semantics { contentDescription = "Escolher dia do mês" },
        shape = RoundedCornerShape(22.dp),
        color = scheme.surface,
        border = BorderStroke(1.dp, scheme.outline),
    ) {
        Column(Modifier.padding(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                MonthToggle(
                    label = pickerMonthTitle(browsing),
                    expanded = true,
                    onClick = onClose,
                    modifier = Modifier.padding(start = 6.dp),
                )
                Row {
                    MonthArrow(BraidIcons.chevronLeft, "Mês anterior") { browsing = shiftMonthKey(browsing, -1) }
                    MonthArrow(BraidIcons.chevronRight, "Próximo mês") { browsing = shiftMonthKey(browsing, 1) }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (dayKey in weekOf(browsing)) {
                    Text(
                        text = weekday(dayKey).take(3).uppercase(),
                        modifier = Modifier.weight(1f),
                        color = scheme.onSurfaceVariant,
                        fontFamily = BraidMonoFont,
                        fontSize = 12.sp,
                        lineHeight = 20.sp,
                        letterSpacing = 0.04.em,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            for (week in monthGridOf(browsing).chunked(7)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    for (dayKey in week) {
                        MonthDay(
                            dayKey = dayKey,
                            outside = !isSameMonth(dayKey, browsing),
                            isToday = dayKey == todayKey,
                            isSelected = dayKey == selectedDay,
                            description = dayDescription(dayKey, todayKey),
                            onClick = { onSelect(dayKey) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            HorizontalDivider(Modifier.padding(top = 4.dp), color = scheme.outline)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                BraidPill(text = "Hoje", onClick = { onSelect(todayKey) }, brandDot = true)
                Text(text = briefDate(todayKey), color = scheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
            }
        }
    }
}

@Composable
private fun MonthArrow(
    icon: List<SvgPart>,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(40.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        SvgIcon(icon, size = 18.dp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MonthDay(
    dayKey: String,
    outside: Boolean,
    isToday: Boolean,
    isSelected: Boolean,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val scheme = MaterialTheme.colorScheme
    val tokens = braidTokens()
    val textColor =
        when {
            isSelected -> scheme.onPrimary
            isToday -> tokens.brandAccent
            outside -> scheme.onSurfaceVariant.copy(alpha = 0.6f)
            else -> scheme.onBackground
        }
    Box(
        modifier
            .height(40.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (isSelected) scheme.primary else Color.Transparent)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = description
                selected = isSelected
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = dayNumber(dayKey),
            color = textColor,
            fontSize = 15.sp,
            fontWeight = if (isSelected || isToday) FontWeight.Bold else FontWeight.Normal,
        )
        if (isToday) {
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 5.dp)
                    .size(4.dp)
                    .background(if (isSelected) tokens.onPrimaryBrand else tokens.brand, CircleShape),
            )
        }
    }
}
