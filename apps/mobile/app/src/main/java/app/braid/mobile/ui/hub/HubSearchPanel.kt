package app.braid.mobile.ui.hub

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrand

/**
 * “Pesquisar” (`/buscar` no chat): a caixa de busca no cabeçalho, ao lado da
 * seta de volta ao chat, e a lista de resultados (`.hubResults`) embaixo, como o
 * `manualPanel` do web. Evento e nota abrem a tela deles; a tarefa ainda não tem
 * tela no app.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun HubSearchPanel(
    onBack: () -> Unit,
    onOpenEvent: (String) -> Unit,
    onOpenNote: (String) -> Unit,
    modifier: Modifier = Modifier,
    initialQuery: String = "",
    viewModel: HubSearchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = MaterialTheme.colorScheme

    LaunchedEffect(initialQuery) {
        if (initialQuery.isNotBlank()) viewModel.setQuery(initialQuery)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        HubBackHeader(onBack = onBack) {
            HubSearchBox(
                modifier = Modifier.fillMaxWidth(),
                value = state.query,
                onValueChange = viewModel::setQuery,
                placeholder = "Buscar eventos, tarefas e notas",
            )
        }
        Text(
            modifier = Modifier.padding(top = 12.dp, bottom = 12.dp),
            text = if (state.query.isBlank()) "No seu espaço" else "Resultados",
            fontSize = 12.sp,
            color = colors.onSurfaceVariant,
        )
        when {
            state.loading && state.results.isEmpty() ->
                Text("Carregando…", fontSize = 12.sp, color = colors.onSurfaceVariant)
            state.failed ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Não foi possível pesquisar.", fontSize = 12.sp, color = colors.error)
                    TextButton(onClick = viewModel::load) { Text("Tentar novamente") }
                }
            state.results.isEmpty() ->
                Text("Nenhum resultado. Que tal criar algo novo?", fontSize = 12.sp, color = colors.onSurfaceVariant)
            else ->
                LazyColumn(
                    modifier = Modifier.weight(1f, fill = false).heightIn(max = 260.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp),
                ) {
                    items(state.results, key = { "${it.kind}:${it.id}" }) { result ->
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = result.kind != SearchKind.Task) {
                                        when (result.kind) {
                                            SearchKind.Event -> onOpenEvent(result.id)
                                            SearchKind.Note -> onOpenNote(result.id)
                                            SearchKind.Task -> Unit
                                        }
                                    }.padding(horizontal = 4.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Icon(
                                imageVector = result.kind.icon(),
                                contentDescription = null,
                                tint = braidBrand(),
                                modifier = Modifier.size(20.dp),
                            )
                            Column {
                                Text(text = result.title, fontSize = 13.sp, maxLines = 1)
                                Text(
                                    modifier = Modifier.padding(top = 4.dp),
                                    text = result.subtitle,
                                    fontSize = 10.sp,
                                    color = colors.onSurfaceVariant,
                                )
                            }
                        }
                        HorizontalDivider(color = colors.outline)
                    }
                }
        }
    }
}

private fun SearchKind.icon() =
    when (this) {
        SearchKind.Event -> LucideIcons.calendarDays(1.3f)
        SearchKind.Task -> LucideIcons.squareCheck(1.3f)
        SearchKind.Note -> LucideIcons.notepadText(1.3f)
    }
