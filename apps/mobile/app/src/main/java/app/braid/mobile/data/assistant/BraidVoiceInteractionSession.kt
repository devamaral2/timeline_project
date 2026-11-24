package app.braid.mobile.data.assistant

import android.content.Context
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import app.braid.mobile.MainActivity

/**
 * Uma chamada do assistente (o gesto do sistema): em vez de desenhar uma janela própria, abre a `MainActivity` já com o
 * chat à vista e encerra a sessão. Com o celular bloqueado o sistema pede o desbloqueio antes de mostrar a tela.
 */
class BraidVoiceInteractionSession(
    context: Context,
) : VoiceInteractionSession(context) {
    override fun onShow(
        args: Bundle?,
        showFlags: Int,
    ) {
        super.onShow(args, showFlags)
        startAssistantActivity(MainActivity.openChatIntent(context))
        finish()
    }
}
