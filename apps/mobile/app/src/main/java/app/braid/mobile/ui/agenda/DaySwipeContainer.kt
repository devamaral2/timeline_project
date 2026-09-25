package app.braid.mobile.ui.agenda

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import app.braid.mobile.domain.timeline.shiftDayKey

fun Modifier.daySwipe(
    dayKey: String,
    onSelect: (String) -> Unit,
): Modifier =
    pointerInput(dayKey) {
        var distance = 0f
        detectHorizontalDragGestures(
            onHorizontalDrag = { _, amount -> distance += amount },
            onDragEnd = {
                when {
                    distance < -80f -> onSelect(shiftDayKey(dayKey, 1))
                    distance > 80f -> onSelect(shiftDayKey(dayKey, -1))
                }
                distance = 0f
            },
            onDragCancel = { distance = 0f },
        )
    }
