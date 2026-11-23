package app.braid.mobile.ui.aiedit

import androidx.activity.compose.BackHandler
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.editFieldLabel
import app.braid.mobile.domain.request.editPlaceholder
import app.braid.mobile.domain.request.editSectionLabel
import app.braid.mobile.ui.chat.ModelActions
import app.braid.mobile.ui.chat.ModelScrim
import kotlin.math.roundToInt

/**
 * A barra de edição por IA no pé de um detalhe (ADR 0006): o que se escreve edita a entidade aberta ([entityType] e
 * [entityId]); quando o pedido termina e mexe em algo, [onEdited] manda a tela reler a entidade. [disabledReason] desliga
 * a barra e diz por quê. Com as opções do servidor lidas, o campo mostra o seletor de modelo do chat (ADR 0019): aberto, o
 * painel cresce do campo e o detalhe atrás escurece; tocar fora, "Selecionar" ou o voltar do sistema o fecha.
 */
@Composable
fun EntityEditBar(
    entityType: EditEntityType,
    entityId: String,
    context: AiEditContext,
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

    // O seletor de modelo: quem guarda se o painel está aberto é a barra, como o chat. Sem as opções, ele some e fecha.
    val picker = state.picker
    var pickerOpen by rememberSaveable { mutableStateOf(false) }
    val showPicker = picker != null
    LaunchedEffect(showPicker) { if (!showPicker) pickerOpen = false }
    BackHandler(enabled = pickerOpen) { pickerOpen = false }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    // Onde a barra começa na tela: o fundo escuro cobre dali para cima.
    var top by remember { mutableIntStateOf(0) }

    Box(modifier.fillMaxWidth().onGloballyPositioned { top = it.positionInRoot().y.roundToInt() }) {
        // O fundo cobre o detalhe acima da barra (o cabeçalho e o conteúdo), como o do chat cobre a conversa; a barra fica à vista.
        if (showPicker) ModelScrim(pickerOpen, { pickerOpen = false }, Modifier.above(top))
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
                        context = context,
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
                        onSend = viewModel::submit,
                        onDismiss = viewModel::dismiss,
                        onToggleVoice = viewModel::toggleVoice,
                    ),
                picker =
                    picker?.let {
                        AiEditBarPicker(
                            picker = it,
                            open = pickerOpen,
                            onToggle = {
                                pickerOpen = !pickerOpen
                                if (pickerOpen) {
                                    focusManager.clearFocus()
                                    keyboard?.hide()
                                }
                            },
                            onDone = { pickerOpen = false },
                            actions = ModelActions(viewModel::chooseProvider, viewModel::chooseModel, viewModel::chooseEffort),
                        )
                    },
            )
        }
    }
}

/**
 * Desenha o conteúdo logo acima de quem o contém, com [height] pixels de altura, sem ocupar lugar no layout: é como o fundo
 * escuro do seletor cobre o detalhe sem que as telas de detalhe precisem saber dele.
 */
private fun Modifier.above(height: Int): Modifier =
    layout { measurable, constraints ->
        val placeable = measurable.measure(Constraints.fixed(constraints.maxWidth, height))
        layout(placeable.width, 0) { placeable.place(0, -height) }
    }
