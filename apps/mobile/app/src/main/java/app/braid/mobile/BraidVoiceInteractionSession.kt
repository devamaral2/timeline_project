package app.braid.mobile

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.view.View
import android.view.WindowManager
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import app.braid.mobile.core.designsystem.BraidTheme
import app.braid.mobile.data.assistant.AssistantEntryPoint
import app.braid.mobile.domain.settings.isDark
import app.braid.mobile.ui.assistant.AssistantPanel
import app.braid.mobile.ui.assistant.AssistantRecordsViewModel
import app.braid.mobile.ui.chat.ChatViewModel
import dagger.hilt.android.EntryPointAccessors

/**
 * Uma chamada do assistente (o gesto do sistema). Não abre o app: desenha o painel [AssistantPanel] numa janela da
 * própria sessão, sobre o que estiver na tela (e sobre o bloqueio), ouve, manda o pedido ao agente e mostra a resposta ali
 * mesmo, com um cartão por registro criado. Cada chamada começa uma conversa nova, com o microfone já aberto.
 *
 * Uma janela de sessão não é uma `Activity`: a sessão faz as vezes de dono do ciclo de vida, do estado salvo e do
 * armazém de `ViewModel`s que o Compose procura na árvore de views.
 */
class BraidVoiceInteractionSession(
    context: Context,
) : VoiceInteractionSession(context),
    LifecycleOwner,
    SavedStateRegistryOwner,
    ViewModelStoreOwner {
    private val registry = LifecycleRegistry(this)
    private val savedState = SavedStateRegistryController.create(this)
    override val viewModelStore = ViewModelStore()
    override val lifecycle: Lifecycle get() = registry
    override val savedStateRegistry: SavedStateRegistry get() = savedState.savedStateRegistry

    private var chat: ChatViewModel? = null

    override fun onCreate() {
        super.onCreate()
        savedState.performRestore(null)
        registry.currentState = Lifecycle.State.CREATED
    }

    override fun onCreateContentView(): View {
        val entry = EntryPointAccessors.fromApplication(context.applicationContext, AssistantEntryPoint::class.java)
        val provider =
            ViewModelProvider(
                this,
                object : ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : ViewModel> create(modelClass: Class<T>): T =
                        if (modelClass == AssistantRecordsViewModel::class.java) {
                            AssistantRecordsViewModel(entry.taskDetails()) as T
                        } else {
                            ChatViewModel(
                                repository = entry.chatRepository(),
                                session = entry.session(),
                                clock = entry.clock(),
                                polling = entry.polling(),
                                models = entry.models(),
                                transcription = entry.transcription(),
                                speech = entry.speech(),
                                microphone = entry.microphone(),
                            ) as T
                        }
                },
            )
        val model = provider[ChatViewModel::class.java]
        val records = provider[AssistantRecordsViewModel::class.java]
        chat = model

        window?.window?.apply {
            // Transparente: o painel desenha a própria sombra. Sobre o bloqueio e com o teclado empurrando o campo.
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            @Suppress("DEPRECATION")
            addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
            setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
            // O Compose procura o dono do ciclo de vida a partir da raiz da janela, não só da própria view.
            decorView.setViewTreeLifecycleOwner(this@BraidVoiceInteractionSession)
            decorView.setViewTreeSavedStateRegistryOwner(this@BraidVoiceInteractionSession)
            decorView.setViewTreeViewModelStoreOwner(this@BraidVoiceInteractionSession)
        }

        return ComposeView(context).apply {
            setViewTreeLifecycleOwner(this@BraidVoiceInteractionSession)
            setViewTreeSavedStateRegistryOwner(this@BraidVoiceInteractionSession)
            setViewTreeViewModelStoreOwner(this@BraidVoiceInteractionSession)
            setContent {
                val choice by entry.themes().choice.collectAsState(initial = null)
                BraidTheme(darkTheme = choice.isDark(isSystemInDarkTheme())) {
                    AssistantPanel(
                        chat = model,
                        records = records,
                        onClose = ::finish,
                        onOpenApp = {
                            startAssistantActivity(Intent(context, MainActivity::class.java))
                            finish()
                        },
                        // O cartão da tarefa criada abre o detalhe dela no app, pelo mesmo extra da notificação do lembrete.
                        onOpenTask = { taskId ->
                            startAssistantActivity(Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_TASK_ID, taskId))
                            finish()
                        },
                    )
                }
            }
        }
    }

    override fun onShow(
        args: Bundle?,
        showFlags: Int,
    ) {
        super.onShow(args, showFlags)
        registry.currentState = Lifecycle.State.RESUMED
        // A tela não apaga enquanto o painel está à vista (o tempo de ouvir e de esperar a resposta).
        setKeepAwake(true)
        // Cada chamada é uma conversa nova, e `open()` já liga o microfone.
        chat?.apply {
            startNewConversation()
            open()
        }
    }

    /**
     * O sistema avisa quando o bloqueio aparece, e o padrão é esconder a sessão. Com a tela apagada o gesto acende o aparelho
     * já com o bloqueio, e esse aviso fechava o painel (e o microfone) logo depois de abrir. O painel fica sobre o bloqueio.
     */
    override fun onLockscreenShown() = Unit

    override fun onHide() {
        setKeepAwake(false)
        chat?.close()
        registry.currentState = Lifecycle.State.CREATED
        super.onHide()
    }

    override fun onDestroy() {
        chat?.close()
        registry.currentState = Lifecycle.State.DESTROYED
        viewModelStore.clear()
        super.onDestroy()
    }
}
