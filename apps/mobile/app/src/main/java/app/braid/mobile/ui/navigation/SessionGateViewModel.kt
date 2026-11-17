package app.braid.mobile.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.session.SessionRepository
import app.braid.mobile.domain.session.SessionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SessionGateViewModel
    @Inject
    constructor(
        private val session: SessionRepository,
    ) : ViewModel() {
        val state: StateFlow<SessionState> = session.state

        init {
            viewModelScope.launch { session.restore() }
        }
    }
