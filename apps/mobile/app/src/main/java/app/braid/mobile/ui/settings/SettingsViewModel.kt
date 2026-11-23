package app.braid.mobile.ui.settings

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.reminder.ReminderSync
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.domain.settings.ThemeChoice
import app.braid.mobile.domain.settings.ThemeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@Immutable
data class SettingsUiState(
    /** A escolha manual de tema; `null` enquanto o sistema decide. */
    val themeChoice: ThemeChoice? = null,
    /** "Sair da conta" só existe com um usuário na sessão, como no web. */
    val signedIn: Boolean = false,
    val signingOut: Boolean = false,
)

/** A tela "Configurações" do chat: o interruptor de tema e o "Sair da conta". */
@HiltViewModel
class SettingsViewModel
    @Inject
    constructor(
        private val themes: ThemeRepository,
        private val session: SessionRepository,
        private val reminders: ReminderSync,
    ) : ViewModel() {
        private val signingOut = MutableStateFlow(false)

        val state: StateFlow<SettingsUiState> =
            combine(themes.choice, session.state, signingOut) { choice, sessionState, leaving ->
                SettingsUiState(themeChoice = choice, signedIn = sessionState is SessionState.SignedIn, signingOut = leaving)
            }.stateIn(
                viewModelScope,
                SharingStarted.Eagerly,
                SettingsUiState(signedIn = session.state.value is SessionState.SignedIn),
            )

        /** Vira o que a tela mostra agora: o tema escolhido, ou o do sistema enquanto não há escolha. */
        fun toggleTheme(currentlyDark: Boolean) {
            viewModelScope.launch { themes.select(if (currentlyDark) ThemeChoice.Light else ThemeChoice.Dark) }
        }

        /**
         * Revoga o refresh token e apaga a sessão (mesmo que o Auth não responda) e cancela os lembretes agendados e as
         * chaves já disparadas. Com a sessão perdida, a navegação volta ao login e fecha o chat.
         */
        fun signOut() {
            if (!signingOut.compareAndSet(expect = false, update = true)) return
            viewModelScope.launch {
                try {
                    withContext(NonCancellable) {
                        session.signOut()
                        // Depois da sessão: uma releitura em curso não agenda de novo o que acabou de ser cancelado.
                        try {
                            reminders.clear()
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (_: Exception) {
                            // O armazenamento dos alarmes falhou; a sessão já foi apagada e o app volta ao login.
                        }
                    }
                } finally {
                    signingOut.value = false
                }
            }
        }
    }
