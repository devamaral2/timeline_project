package app.braid.mobile.ui.agenda

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.time.Instant

@Composable
fun rememberCurrentInstant(): Instant {
    val now by
        produceState(initialValue = Instant.now()) {
            while (isActive) {
                delay(1_000)
                value = Instant.now()
            }
        }
    return now
}
