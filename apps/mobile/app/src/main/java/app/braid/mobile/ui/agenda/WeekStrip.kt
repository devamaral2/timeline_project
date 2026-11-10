package app.braid.mobile.ui.agenda

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.DarkTokens
import app.braid.mobile.core.designsystem.LightTokens
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.domain.timeline.dayNumber
import app.braid.mobile.domain.timeline.weekOf
import app.braid.mobile.domain.timeline.weekday

@Composable
@Suppress("ktlint:standard:function-naming")
fun WeekStrip(
    selectedDayKey: String,
    todayKey: String,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        weekOf(selectedDayKey).forEach { dayKey ->
            val selected = dayKey == selectedDayKey
            val isToday = dayKey == todayKey
            Column(
                modifier =
                    Modifier
                        .width(46.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .semantics {
                            contentDescription = dayKey
                            role = Role.Button
                            this.selected = selected
                        }.clickable(onClick = { onSelect(dayKey) })
                        .padding(vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = weekday(dayKey).take(3),
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                // Como os números do calendário do mês: hoje na cor da marca e o dia em foco num retângulo suave.
                val dark = LocalBraidDarkTheme.current
                val accent = if (dark) DarkTokens.brandAccent else LightTokens.brandAccent
                Surface(
                    modifier = Modifier.fillMaxWidth().height(40.dp),
                    shape = RoundedCornerShape(10.dp),
                    color = if (selected) (if (dark) DarkTokens.brandSoft else LightTokens.brandSoft) else Color.Transparent,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(
                            text = dayNumber(dayKey),
                            style =
                                MaterialTheme.typography.labelLarge.copy(
                                    fontSize = 12.sp,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                ),
                            color = if (selected || isToday) accent else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}
