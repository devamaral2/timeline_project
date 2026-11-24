package app.braid.mobile.ui.assistant

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.ui.chat.ChatMessage
import app.braid.mobile.ui.chat.ChatViewModel
import app.braid.mobile.ui.settings.SettingsIcons

private val PanelShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
private val FieldShape = RoundedCornerShape(26.dp)
private val close = listOf(SvgPart("M18 6 6 18"), SvgPart("m6 6 12 12"))
private val arrowUp = listOf(SvgPart("m5 12 7-7 7 7"), SvgPart("M12 19V5"))

/**
 * O painel do assistente do celular, como o do Gemini: uma folha na base da tela, sobre uma sombra, com o que a pessoa
 * disse, a resposta do agente e um campo com microfone. Quem manda é o [chat]: ele ouve (o microfone abre sozinho), envia no
 * silêncio, acompanha o pedido e volta a ouvir depois da resposta, como no chat do app.
 */
@Composable
fun AssistantPanel(
    chat: ChatViewModel,
    onClose: () -> Unit,
    onOpenApp: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val state by chat.state.collectAsState()
    var text by remember { mutableStateOf("") }
    // O microfone que a pessoa negou: sem uma Activity aqui não há como pedir, então o painel manda para o app.
    var micDenied by remember { mutableStateOf(false) }

    LaunchedEffect(chat) {
        // A voz escreve no campo (a transcrição, ou o campo limpo quando o que foi dito é enviado).
        chat.promptEdits.collect {
            text = it
            chat.syncDraft(it)
        }
    }
    LaunchedEffect(state.voice.askPermission) {
        if (state.voice.askPermission) {
            micDenied = true
            chat.microphoneResult(granted = false)
        }
    }

    val lastUserIndex = state.messages.indexOfLast { it is ChatMessage.User }
    val reply =
        state.messages
            .withIndex()
            .lastOrNull { (index, message) ->
                index > lastUserIndex &&
                    (message is ChatMessage.Assistant || message is ChatMessage.Error)
            }?.value
    val user = state.messages.getOrNull(lastUserIndex) as? ChatMessage.User
    val listening = state.voice.listening

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.32f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(PanelShape)
                .background(scheme.background)
                // Toques no painel não fecham: só o que está fora dele.
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = {})
                .windowInsetsPadding(WindowInsets.navigationBars)
                .windowInsetsPadding(WindowInsets.ime)
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Braid",
                    modifier = Modifier.weight(1f),
                    color = scheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "Abrir o app",
                    modifier = Modifier.clickable(role = Role.Button, onClick = onOpenApp).padding(horizontal = 8.dp, vertical = 8.dp),
                    color = scheme.onSurfaceVariant,
                    fontSize = 13.sp,
                )
                Box(
                    Modifier
                        .size(40.dp)
                        .clickable(role = Role.Button, onClick = onClose)
                        .semantics { contentDescription = "Fechar o assistente" },
                    contentAlignment = Alignment.Center,
                ) {
                    SvgIcon(close, size = 20.dp, color = scheme.onSurfaceVariant, modifier = Modifier.clearAndSetSemantics {})
                }
            }

            Column(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 72.dp, max = 340.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                when {
                    state.signedOut || (!state.ready && state.messages.isEmpty() && !listening) ->
                        Hint(if (state.signedOut) "Entre na sua conta no app para usar o assistente." else "Conectando…")
                    else -> {
                        user?.let { Text(it.text, color = scheme.onSurfaceVariant, fontSize = 15.sp, lineHeight = 22.sp) }
                        when {
                            reply is ChatMessage.Assistant -> AssistantAnswer(reply.text)
                            reply is ChatMessage.Error -> Hint(reply.text)
                        }
                        when {
                            state.pending != null -> Thinking(state.pending?.label ?: "Pensando…")
                            listening -> Listening(state.voice.heard)
                            user == null && reply == null ->
                                Hint(
                                    if (micDenied) "Permita o microfone nas configurações do app." else "Pode falar…",
                                )
                        }
                        state.voice.notice?.let { Hint(it) }
                    }
                }
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .border(1.dp, scheme.outline, FieldShape)
                    .padding(start = 18.dp, end = 6.dp)
                    .heightIn(min = 52.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    if (text.isEmpty()) Text("Pergunte ao Braid", color = scheme.onSurfaceVariant, fontSize = 16.sp)
                    BasicTextField(
                        value = text,
                        onValueChange = {
                            text = it
                            chat.typed(it)
                        },
                        modifier = Modifier.fillMaxWidth(),
                        textStyle = TextStyle(color = scheme.onBackground, fontSize = 16.sp, lineHeight = 22.sp),
                        cursorBrush = SolidColor(scheme.primary),
                        maxLines = 4,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { if (chat.submit(text)) text = "" }),
                    )
                }
                val canSend = text.isNotBlank() && state.pending == null
                val micAvailable = state.voice.available && !canSend
                if (canSend || micAvailable) {
                    Box(
                        Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(if (canSend || listening) scheme.primary else Color.Transparent)
                            .clickable(role = Role.Button) {
                                if (canSend) {
                                    if (chat.submit(text)) text = ""
                                } else {
                                    micDenied = false
                                    chat.toggleVoice()
                                }
                            }.semantics {
                                contentDescription =
                                    if (canSend) {
                                        "Enviar"
                                    } else if (listening) {
                                        "Parar de ouvir"
                                    } else {
                                        "Falar"
                                    }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        SvgIcon(
                            parts = if (canSend) arrowUp else SettingsIcons.mic,
                            size = 20.dp,
                            color = if (canSend || listening) scheme.onPrimary else scheme.onBackground,
                            modifier = Modifier.clearAndSetSemantics {},
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text = text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, lineHeight = 22.sp)
}

/** O que o microfone já ouviu, no tamanho de uma fala, com os três pontos que mostram que a escuta está de pé. */
@Composable
private fun Listening(heard: String) {
    val scheme = MaterialTheme.colorScheme
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = heard.ifBlank { "Ouvindo…" },
            color = if (heard.isBlank()) scheme.onSurfaceVariant else scheme.onBackground,
            fontSize = 20.sp,
            lineHeight = 28.sp,
        )
        Dots()
    }
}

@Composable
private fun Thinking(label: String) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Hint(label)
        Dots()
    }
}

private const val DOT_MS = 600
private const val DOT_STAGGER_MS = 150

@Composable
private fun Dots() {
    val scheme = MaterialTheme.colorScheme
    val transition = rememberInfiniteTransition(label = "dots")
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.clearAndSetSemantics {}) {
        repeat(3) { index ->
            val alpha by transition.animateFloat(
                initialValue = 0.25f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(DOT_MS, delayMillis = index * DOT_STAGGER_MS), RepeatMode.Reverse),
                label = "dot$index",
            )
            Box(Modifier.size(8.dp).alpha(alpha).background(scheme.primary, CircleShape))
        }
    }
}
