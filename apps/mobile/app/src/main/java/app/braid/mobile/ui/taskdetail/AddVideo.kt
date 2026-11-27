package app.braid.mobile.ui.taskdetail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidPill
import app.braid.mobile.ui.taskedit.AddButton
import app.braid.mobile.ui.taskedit.FormField

/** As ações do "Adicionar vídeo" que a tela entrega ao ViewModel. */
class AddVideoActions(
    val onShow: () -> Unit,
    val onHide: () -> Unit,
    val onType: (String) -> Unit,
    val onSubmit: () -> Unit,
)

private const val LINK_LABEL = "Link do vídeo do YouTube"
private const val BUTTON_LABEL = "Adicionar vídeo"

/**
 * "Adicionar vídeo" na seção Artefatos da Leitura diária: o botão e, aberto, o campo do link com "Pedir transcrição" e
 * "Cancelar"; o aviso de link recusado fica sob o campo e o de pedido gravado, sob o botão (o `TaskAddVideo` do web).
 */
@Composable
fun AddVideo(
    state: AddVideoState,
    actions: AddVideoActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.open) {
            FormField(
                value = state.link,
                onChange = actions.onType,
                label = LINK_LABEL,
                placeholder = "https://www.youtube.com/watch?v=…",
                invalid = state.error != null,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { actions.onSubmit() }),
            )
            state.error?.let {
                Text(
                    text = it,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    lineHeight = 20.sp,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BraidPill(text = "Pedir transcrição", onClick = { if (!state.busy) actions.onSubmit() }, brandDot = true)
                BraidPill(text = "Cancelar", onClick = actions.onHide)
            }
        } else {
            Row(
                Modifier.clickable(role = Role.Button, onClick = actions.onShow).defaultMinSize(minHeight = 44.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AddButton(BUTTON_LABEL, onClick = actions.onShow)
                Text(BUTTON_LABEL, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 20.sp)
            }
        }
        state.notice?.let {
            Text(
                text = it,
                modifier = Modifier.padding(top = 2.dp).semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
    }
}
