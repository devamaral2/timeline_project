package app.braid.mobile.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.auth.AuthGateway
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.data.session.SessionRepository
import app.braid.mobile.data.session.SessionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SessionGateViewModel
    @Inject
    constructor(
        private val authGateway: AuthGateway,
        private val sessionRepository: SessionRepository,
        private val reminderScheduler: ReminderScheduler,
    ) : ViewModel() {
        val state: StateFlow<SessionState> = sessionRepository.state

        init {
            viewModelScope.launch { sessionRepository.restore() }
        }

        fun signOut() {
            viewModelScope.launch {
                reminderScheduler.cancelAll()
                sessionRepository.snapshot()?.let { authGateway.logout(it.refreshToken) }
                sessionRepository.signOut()
            }
        }
    }
