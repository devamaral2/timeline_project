package app.braid.mobile.ui.picker

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.ui.taskedit.FormField
import app.braid.mobile.ui.taskedit.TaskEditIcons

const val PICKER_SEARCHING = "Buscando…"
const val PICKER_NOTHING_FOUND = "Nada encontrado para essa busca."
const val PICKER_NOTHING_TO_LINK = "Nada para ligar por aqui."

/**
 * A folha de seleção de entidade (o `EntityPickerDialog` do web): sobe do pé com o título, o campo de busca (que já
 * chega com o foco), os resultados e, embaixo, fora da rolagem, o que cria a entidade em vez de ligar uma que existe.
 * Escolher um resultado entrega o item ([onPick]); o "x" e o toque fora fecham sem escolher ([onClose]). Não sabe de que
 * é a lista: quem a usa passa o estado do [EntityPickerController], o desenho de cada escolha e o rodapé.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> EntityPickerSheet(
    title: String,
    searchLabel: String,
    state: EntityPickerState<T>,
    failedMessage: String,
    keyOf: (T) -> String,
    nameOf: (T) -> String,
    onType: (String) -> Unit,
    onPick: (T) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    footer: @Composable () -> Unit = {},
    renderItem: @Composable (T) -> Unit,
) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.background,
        modifier = modifier.semantics { contentDescription = title },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(SHEET_HEIGHT)
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = title,
                    modifier = Modifier.weight(1f).semantics { heading() },
                    color = MaterialTheme.colorScheme.onBackground,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Box(
                    Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .clickable(role = Role.Button, onClick = onClose)
                        .semantics { contentDescription = "Fechar" },
                    contentAlignment = Alignment.Center,
                ) {
                    SvgIcon(
                        TaskEditIcons.x,
                        size = 18.dp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.clearAndSetSemantics {},
                    )
                }
            }
            FormField(
                value = state.typed,
                onChange = onType,
                label = searchLabel,
                modifier = Modifier.focusRequester(focus),
                placeholder = searchLabel,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            )
            Column(Modifier.weight(1f)) {
                if (state.results.isNotEmpty()) {
                    LazyColumn(Modifier.semantics { contentDescription = "Resultados: $searchLabel" }) {
                        items(state.results, key = keyOf) { item ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable(role = Role.Button) { onPick(item) }
                                    .semantics { contentDescription = "Escolher “${nameOf(item)}”" }
                                    .padding(vertical = 10.dp),
                                verticalArrangement = Arrangement.spacedBy(3.dp),
                            ) { renderItem(item) }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        }
                    }
                }
                when {
                    state.status == PickerSearchStatus.Failed -> Message(failedMessage, alert = true)
                    state.status == PickerSearchStatus.Loading && state.results.isEmpty() -> Message(PICKER_SEARCHING)
                    state.status == PickerSearchStatus.Ready && state.results.isEmpty() ->
                        Message(if (state.query.isEmpty()) PICKER_NOTHING_TO_LINK else PICKER_NOTHING_FOUND)
                }
            }
            footer()
        }
    }
}

private const val SHEET_HEIGHT = 0.85f

@Composable
private fun Message(
    text: String,
    alert: Boolean = false,
) {
    Text(
        text = text,
        modifier =
            Modifier.padding(vertical = 12.dp).semantics {
                liveRegion = if (alert) LiveRegionMode.Assertive else LiveRegionMode.Polite
            },
        color = if (alert) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
}
