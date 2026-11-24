package app.braid.mobile.ui.aiedit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.editFieldLabel
import app.braid.mobile.domain.request.editPlaceholder
import app.braid.mobile.domain.request.editSectionLabel
import app.braid.mobile.domain.request.isModelCommand
import app.braid.mobile.ui.chat.HermesFieldLayout
import app.braid.mobile.ui.chat.ModelActions
import app.braid.mobile.ui.chat.ModelSheet

/**
 * A barra de edição por IA no pé de um detalhe (ADR 0006): o que se escreve edita a entidade aberta ([entityType] e
 * [entityId]); quando o pedido termina e mexe em algo, [onEdited] manda a tela reler a entidade. [disabledReason] desliga
 * a barra e diz por quê. Com as opções do servidor lidas, o campo tem a escolha de modelo do chat (ADR 0019): aberta, a
 * folha sobe por cima da tela inteira; o X, tocar no fundo ou o voltar do sistema a fecha.
 *
 * O desenho é a pílula do canvas "Input do detalhe da entidade": o robô sem disco nem cor e uma linha com o texto, a onda
 * e a seta, sem nada do modelo à vista. Enviar `/model` abre a folha da escolha, em vez de
 * virar pedido. O campo não repete o registro aberto: a tela já o mostra.
 */
@Composable
fun EntityEditBar(
    entityType: EditEntityType,
    entityId: String,
    onEdited: () -> Unit,
    modifier: Modifier = Modifier,
    disabledReason: String? = null,
    viewModel: EntityEditViewModel =
        hiltViewModel<EntityEditViewModel, EntityEditViewModel.Factory>(key = "${entityType.code}:$entityId") {
            it.create(entityType, entityId)
        },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val reload by rememberUpdatedState(onEdited)
    LaunchedEffect(viewModel) { viewModel.edited.collect { reload() } }
    // Fora de vista o microfone desliga e o acompanhamento do pedido espera.
    LifecycleResumeEffect(viewModel) {
        viewModel.setVisible(true)
        onPauseOrDispose { viewModel.setVisible(false) }
    }
    // A resposta do sistema volta ao ViewModel, que liga a escuta ou explica.
    MicrophonePermissionEffect(state.voice.askPermission, viewModel::microphoneResult)
    val locked = state.busy || disabledReason != null

    // O seletor de modelo: quem guarda se a folha está aberta é a barra, como o chat. Sem as opções, ele some e fecha.
    val picker = state.picker
    var pickerOpen by rememberSaveable { mutableStateOf(false) }
    val showPicker = picker != null
    LaunchedEffect(showPicker) { if (!showPicker) pickerOpen = false }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    Box(modifier.fillMaxWidth()) {
        if (picker != null) {
            ModelSheet(
                picker = picker,
                open = pickerOpen,
                actions =
                    ModelActions(
                        { provider, model -> viewModel.chooseModel(model, provider) },
                        viewModel::chooseEffort,
                        viewModel::toggleFavorite,
                    ),
                onClose = { pickerOpen = false },
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background)
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            AiEditBar(
                model =
                    AiEditBarModel(
                        draft = state.draft,
                        placeholder = editPlaceholder(entityType),
                        fieldLabel = editFieldLabel(entityType),
                        statusText = state.statusText,
                        context = null,
                        locked = locked,
                        canSend = !locked && state.draft.isNotBlank(),
                        busy = state.busy,
                        canDismiss = state.canDismiss,
                        message = state.message,
                        failed = state.failed,
                        steps = state.request?.steps.orEmpty(),
                        reason = disabledReason,
                        voice = state.voice,
                        sectionLabel = editSectionLabel(entityType),
                    ),
                actions =
                    AiEditBarActions(
                        onDraftChange = viewModel::onDraftChange,
                        onSend = {
                            // `/model` abre a folha da escolha do modelo, em vez de virar pedido.
                            if (showPicker && isModelCommand(state.draft)) {
                                viewModel.onDraftChange("")
                                pickerOpen = true
                                focusManager.clearFocus()
                                keyboard?.hide()
                            } else {
                                viewModel.submit()
                            }
                        },
                        onDismiss = viewModel::dismiss,
                        onToggleVoice = viewModel::toggleVoice,
                    ),
                layout = HermesFieldLayout.Pill,
            )
        }
    }
}
