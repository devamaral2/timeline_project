package app.braid.mobile.core.designsystem

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.pullToRefresh
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

/**
 * Puxar o conteúdo para baixo, a partir do topo, relê a tela: o indicador redondo (`--card` com o arco em `--brand`)
 * gira até [refreshing] voltar a ser falso. É o `PullToRefreshBox` do Material com a chave [enabled], que ele não tem:
 * sem ela o gesto fica de fora (esqueleto da primeira leitura, estados sem o que reler). O conteúdo precisa rolar
 * na vertical (`verticalScroll` ou `LazyColumn`), que é de onde o gesto vem.
 */
@Composable
fun BraidPullToRefresh(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    /** Para o indicador sair de baixo de algo fixo no topo do [content], como a barra de status. */
    indicatorModifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val state = rememberPullToRefreshState()
    Box(modifier.pullToRefresh(isRefreshing = refreshing, state = state, enabled = enabled, onRefresh = onRefresh)) {
        content()
        PullToRefreshDefaults.Indicator(
            state = state,
            isRefreshing = refreshing,
            modifier = indicatorModifier.align(Alignment.TopCenter),
            containerColor = MaterialTheme.colorScheme.surface,
            color = braidBrand(),
        )
    }
}
