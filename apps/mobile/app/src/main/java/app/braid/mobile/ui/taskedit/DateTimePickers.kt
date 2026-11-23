package app.braid.mobile.ui.taskedit

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import app.braid.mobile.domain.time.MINUTES_PER_HOUR
import app.braid.mobile.domain.timeline.dayKeyOf
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Os minutos do seletor de hora andam de 5 em 5, como no web. */
const val MINUTE_STEP = 5

/** `HH:MM` do seletor: a hora e os minutos, estes arredondados para baixo ao passo de 5. */
fun timeKey(
    hour: Int,
    minute: Int,
): String = "%02d:%02d".format(hour, minute - minute % MINUTE_STEP)

/** O seletor de data do Android (Material): "Concluir" grava o dia, "Limpar" tira a data e "Hoje" escolhe o dia de hoje. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerSheet(
    value: String,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val initial =
        runCatching {
            LocalDate
                .parse(value)
                .atStartOfDay()
                .toInstant(ZoneOffset.UTC)
                .toEpochMilli()
        }.getOrNull()
    val state = rememberDatePickerState(initialSelectedDateMillis = initial)
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    val millis = state.selectedDateMillis
                    if (millis ==
                        null
                    ) {
                        onDismiss()
                    } else {
                        onPick(
                            Instant
                                .ofEpochMilli(millis)
                                .atZone(ZoneOffset.UTC)
                                .toLocalDate()
                                .toString(),
                        )
                    }
                },
            ) { Text("Concluir") }
        },
        dismissButton = {
            Row {
                TextButton(onClick = { onPick("") }) { Text("Limpar") }
                TextButton(onClick = { onPick(dayKeyOf(Instant.now())) }) { Text("Hoje") }
                TextButton(onClick = onDismiss) { Text("Cancelar") }
            }
        },
    ) {
        DatePicker(state = state)
    }
}

/** O seletor de hora, em 24 h e passos de 5 minutos: uma coluna de horas e uma de minutos. "Limpar" volta ao dia sem hora. */
@Composable
fun TimePickerSheet(
    value: String,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val parts = value.split(":").mapNotNull { it.toIntOrNull() }
    var hour by remember { mutableIntStateOf(parts.getOrNull(0) ?: DEFAULT_HOUR) }
    var minute by remember { mutableIntStateOf((parts.getOrNull(1) ?: 0) - (parts.getOrNull(1) ?: 0) % MINUTE_STEP) }
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "%02d:%02d".format(hour, minute),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 32.sp,
                    lineHeight = 40.sp,
                )
                Row(Modifier.fillMaxWidth().height(WHEEL_HEIGHT), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Wheel("Hora", (0..HOURS_LAST).toList(), hour, Modifier.weight(1f)) { hour = it }
                    Wheel("Minuto", (0 until MINUTES_PER_HOUR step MINUTE_STEP).toList(), minute, Modifier.weight(1f)) { minute = it }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { onPick("") }) { Text("Limpar") }
                    TextButton(onClick = onDismiss) { Text("Cancelar") }
                    TextButton(onClick = { onPick(timeKey(hour, minute)) }) { Text("Concluir") }
                }
            }
        }
    }
}

@Composable
private fun Wheel(
    label: String,
    values: List<Int>,
    selected: Int,
    modifier: Modifier,
    onSelect: (Int) -> Unit,
) {
    val list = rememberLazyListState()
    LaunchedEffect(Unit) { list.scrollToItem((values.indexOf(selected) - 2).coerceAtLeast(0)) }
    LazyColumn(modifier.semantics { contentDescription = label }, state = list) {
        items(values) { item ->
            val isSelected = item == selected
            Box(
                Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .clip(CircleShape)
                    .background(
                        if (isSelected) MaterialTheme.colorScheme.surfaceVariant else androidx.compose.ui.graphics.Color.Transparent,
                    ).semantics { this.selected = isSelected }
                    .clickable(role = Role.Button) { onSelect(item) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "%02d".format(item),
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 18.sp,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
    }
}

private const val DEFAULT_HOUR = 9
private const val HOURS_LAST = 23
private val WHEEL_HEIGHT = 240.dp
