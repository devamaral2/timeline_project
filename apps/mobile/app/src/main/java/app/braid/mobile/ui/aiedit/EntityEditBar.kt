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
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.domain.request.EditEntityType
import app.braid.mobile.domain.request.editFieldLabel
import app.braid.mobile.domain.request.editPlaceholder
import app.braid.mobile.domain.request.editSectionLabel

/**
 * A barra de edição por IA no pé de um detalhe (ADR 0006): o que se escreve edita a entidade aberta ([entityType] e
 * [entityId]); quando o pedido termina e mexe em algo, [onEdited] manda a tela reler a entidade. [disabledReason] desliga
 * a barra e diz por quê.
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
    Box(
        modifier
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
        )
    }
}
