package app.braid.mobile.ui.agenda

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.domain.timeline.monthLabel

/**
 * A linha de controles da agenda (`.dateToolbar`): o mês (abre o calendário), à
 * direita “Hoje”.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaToolbar(
    selectedDayKey: String,
    todayKey: String,
    onSelectDay: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var pickerOpen by remember { mutableStateOf(false) }
    val chevronTurn by animateFloatAsState(if (pickerOpen) 180f else 0f, label = "chevron")
    val colors = MaterialTheme.colorScheme

    Row(
        modifier = modifier.fillMaxWidth().padding(start = 18.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            modifier =
                Modifier
                    .heightIn(min = 44.dp)
                    .clip(MaterialTheme.shapes.small)
                    .clickable(onClickLabel = "Escolher outra data") { pickerOpen = true },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Text(
                text = monthName(selectedDayKey, todayKey),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Icon(
                imageVector = LucideIcons.chevronDown(),
                contentDescription = null,
                modifier = Modifier.size(14.dp).rotate(chevronTurn),
                tint = colors.onSurfaceVariant,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                modifier =
                    Modifier
                        .heightIn(min = 40.dp)
                        .clip(MaterialTheme.shapes.small)
                        .clickable(role = Role.Button) { onSelectDay(todayKey) }
                        .padding(horizontal = 10.dp)
                        .padding(vertical = 10.dp),
                text = "Hoje",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = braidBrand(),
            )
        }
    }

    if (pickerOpen) {
        DayPickerDialog(
            selectedDayKey = selectedDayKey,
            todayKey = todayKey,
            onSelect = {
                pickerOpen = false
                onSelectDay(it)
            },
            onDismiss = { pickerOpen = false },
        )
    }
}

/** `monthName` do web: o ano só aparece quando não é o de hoje. */
private fun monthName(
    dayKey: String,
    todayKey: String,
): String {
    val label = monthLabel(dayKey)
    return if (dayKey.take(4) == todayKey.take(4)) label.replace(Regex(" de \\d{4}$"), "") else label
}
