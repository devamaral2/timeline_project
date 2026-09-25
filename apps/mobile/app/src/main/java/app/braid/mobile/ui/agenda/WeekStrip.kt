package app.braid.mobile.ui.agenda

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.braid.mobile.domain.timeline.dayNumber
import app.braid.mobile.domain.timeline.weekOf
import app.braid.mobile.domain.timeline.weekdayInitial

@Composable
@Suppress("ktlint:standard:function-naming")
fun WeekStrip(
    selectedDayKey: String,
    todayKey: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        weekOf(selectedDayKey).forEach { dayKey ->
            val selected = dayKey == selectedDayKey
            val isToday = dayKey == todayKey
            Column(
                modifier =
                    Modifier
                        .semantics {
                            contentDescription = dayKey
                            role = Role.Button
                            this.selected = selected
                        }.clickable(onClick = { onSelect(dayKey) }),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = weekdayInitial(dayKey),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Surface(
                    modifier = Modifier.padding(vertical = 2.dp).size(34.dp),
                    shape = CircleShape,
                    color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(
                            text = dayNumber(dayKey),
                            style = MaterialTheme.typography.labelLarge,
                            color =
                                when {
                                    selected -> MaterialTheme.colorScheme.onPrimary
                                    isToday -> MaterialTheme.colorScheme.primary
                                    else -> MaterialTheme.colorScheme.onSurface
                                },
                        )
                    }
                }
                Surface(
                    modifier = Modifier.size(4.dp),
                    shape = CircleShape,
                    color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                ) {}
            }
        }
    }
}
