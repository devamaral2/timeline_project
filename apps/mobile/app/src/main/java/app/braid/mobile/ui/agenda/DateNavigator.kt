package app.braid.mobile.ui.agenda

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import app.braid.mobile.domain.timeline.dayNumber
import app.braid.mobile.domain.timeline.isSameMonth
import app.braid.mobile.domain.timeline.mediumDate
import app.braid.mobile.domain.timeline.monthGridOf
import app.braid.mobile.domain.timeline.monthLabel
import app.braid.mobile.domain.timeline.relativeDayLabel
import app.braid.mobile.domain.timeline.shiftMonthKey
import app.braid.mobile.domain.timeline.weekOf
import app.braid.mobile.domain.timeline.weekdayInitial

@Composable
@Suppress("ktlint:standard:function-naming")
fun DateNavigator(
    selectedDayKey: String,
    todayKey: String,
    onSelect: (String) -> Unit,
) {
    var pickerOpen by remember { mutableStateOf(false) }
    val isToday = selectedDayKey == todayKey

    Column(
        modifier = Modifier.clickable { pickerOpen = true },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = relativeDayLabel(selectedDayKey, todayKey),
                style = MaterialTheme.typography.titleLarge,
                color = if (isToday) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.primary,
            )
            Icon(Icons.Outlined.ExpandMore, contentDescription = "Escolher outra data")
        }
        Text(
            text = mediumDate(selectedDayKey),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (pickerOpen) {
        DayPickerDialog(
            selectedDayKey = selectedDayKey,
            todayKey = todayKey,
            onSelect = {
                pickerOpen = false
                onSelect(it)
            },
            onDismiss = { pickerOpen = false },
        )
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun DayPickerDialog(
    selectedDayKey: String,
    todayKey: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var monthKey by remember(selectedDayKey) { mutableStateOf(selectedDayKey) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { monthKey = shiftMonthKey(monthKey, -1) }) {
                        Icon(Icons.Outlined.ChevronLeft, contentDescription = "Mês anterior")
                    }
                    Text(text = monthLabel(monthKey), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { monthKey = shiftMonthKey(monthKey, 1) }) {
                        Icon(Icons.Outlined.ChevronRight, contentDescription = "Próximo mês")
                    }
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    weekOf(monthKey).forEach { dayKey ->
                        Text(
                            modifier = Modifier.size(36.dp),
                            text = weekdayInitial(dayKey),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                monthGridOf(monthKey).chunked(7).forEach { week ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        week.forEach { dayKey ->
                            val selected = dayKey == selectedDayKey
                            val outsideMonth = !isSameMonth(dayKey, monthKey)
                            Text(
                                modifier =
                                    Modifier
                                        .size(36.dp)
                                        .semantics { role = Role.Button }
                                        .clickable { onSelect(dayKey) }
                                        .padding(top = 9.dp),
                                text = dayNumber(dayKey),
                                style = MaterialTheme.typography.bodyMedium,
                                color =
                                    when {
                                        selected -> MaterialTheme.colorScheme.primary
                                        dayKey == todayKey -> MaterialTheme.colorScheme.tertiary
                                        outsideMonth -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
                                        else -> MaterialTheme.colorScheme.onSurface
                                    },
                            )
                        }
                    }
                }
                Button(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    onClick = { onSelect(todayKey) },
                ) {
                    Text("Hoje")
                }
            }
        }
    }
}
