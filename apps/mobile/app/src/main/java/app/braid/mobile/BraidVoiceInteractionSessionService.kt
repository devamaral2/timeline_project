package app.braid.mobile

import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

/** Entrega ao sistema a sessão que atende cada chamada do assistente. */
class BraidVoiceInteractionSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = BraidVoiceInteractionSession(this)
}
