package app.braid.mobile.ui.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** Avisa as telas de que um pedido do chat mexeu em registros: o `requestAgendaRefresh` do web. */
val LocalEntitiesChanged = staticCompositionLocalOf<Flow<Unit>> { emptyFlow() }

/** Roda [action] cada vez que o chat avisa que um pedido mexeu em registros (ou pode ter mexido). */
@Composable
fun OnEntitiesChanged(action: () -> Unit) {
    val changed = LocalEntitiesChanged.current
    val current by rememberUpdatedState(action)
    LaunchedEffect(changed) { changed.collect { current() } }
}
