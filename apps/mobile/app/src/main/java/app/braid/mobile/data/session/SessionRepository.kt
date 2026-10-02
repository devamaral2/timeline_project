package app.braid.mobile.data.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed interface SessionState {
    data object Unknown : SessionState

    data object SignedOut : SessionState

    data class SignedIn(
        val user: SessionUser,
    ) : SessionState
}

@Singleton
class SessionRepository
    @Inject
    constructor(
        private val tokenStore: TokenStore,
    ) {
        private val mutableState = MutableStateFlow<SessionState>(SessionState.Unknown)

        val state: StateFlow<SessionState> = mutableState.asStateFlow()

        suspend fun snapshot(): SessionSnapshot? = tokenStore.read()

        suspend fun restore() {
            mutableState.value = tokenStore.read()?.let { SessionState.SignedIn(it.user) } ?: SessionState.SignedOut
        }

        suspend fun signIn(snapshot: SessionSnapshot) {
            tokenStore.write(snapshot)
            mutableState.value = SessionState.SignedIn(snapshot.user)
        }

        suspend fun signOut() {
            tokenStore.clear()
            mutableState.value = SessionState.SignedOut
        }
    }
