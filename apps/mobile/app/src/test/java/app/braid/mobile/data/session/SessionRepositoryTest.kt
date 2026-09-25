package app.braid.mobile.data.session

import app.cash.turbine.test
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class SessionRepositoryTest {
    private val snapshot =
        SessionSnapshot(
            accessToken = "access-token",
            refreshToken = "refresh-token",
            user =
                SessionUser(
                    userId = "user-1",
                    email = "rafael@example.com",
                    name = "Rafael",
                    sessionId = "session-1",
                ),
        )

    @Test
    fun startsUnknownAndRestoresSignedOutWhenStoreIsEmpty() =
        runTest {
            val repository = SessionRepository(FakeTokenStore())
            assertEquals(SessionState.Unknown, repository.state.value)

            repository.state.test {
                assertEquals(SessionState.Unknown, awaitItem())
                repository.restore()
                assertEquals(SessionState.SignedOut, awaitItem())
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun signInPublishesUserAndSignOutClearsTheStore() =
        runTest {
            val store = FakeTokenStore()
            val repository = SessionRepository(store)

            repository.signIn(snapshot)
            assertEquals(SessionState.SignedIn(snapshot.user), repository.state.first())
            assertEquals(snapshot, store.snapshot)

            repository.signOut()
            assertEquals(SessionState.SignedOut, repository.state.value)
            assertEquals(null, store.snapshot)
        }

    private class FakeTokenStore : TokenStore {
        var snapshot: SessionSnapshot? = null

        override suspend fun read(): SessionSnapshot? = snapshot

        override suspend fun write(snapshot: SessionSnapshot) {
            this.snapshot = snapshot
        }

        override suspend fun clear() {
            snapshot = null
        }
    }
}
