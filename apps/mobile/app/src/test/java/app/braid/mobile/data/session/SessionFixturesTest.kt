package app.braid.mobile.data.session

import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.support.Fixtures
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class SessionFixturesTest {
    @Test
    fun `login tokens decode into the DTO`() {
        val tokens = BraidJson.decodeFromString<SessionTokensDto>(Fixtures.text("session-login-tokens"))

        assertEquals("refresh-token-opaco", tokens.refreshToken)
        assertEquals(900L, tokens.accessTokenExpiresInSeconds)
        assertEquals("2026-12-17T12:00:00.000Z", tokens.refreshTokenExpiresAt)
    }

    @Test
    fun `refreshed tokens decode into the DTO`() {
        val tokens = BraidJson.decodeFromString<RefreshedTokensDto>(Fixtures.text("session-refreshed-tokens"))

        assertEquals("refresh-token-novo", tokens.refreshToken)
    }

    @Test
    fun `current user decodes into the DTO`() {
        val user = BraidJson.decodeFromString<CurrentUserDto>(Fixtures.text("session-current-user"))

        assertEquals("Admin", user.name)
        assertEquals("admin@admin.com", user.email)
        assertEquals("user-1", user.userId)
    }

    @Test
    fun `every valid login body is what the DTO sends`() {
        val valid = Fixtures.json("session-login-request").jsonObject["valid"] as JsonArray

        valid.forEach { example ->
            val dto = BraidJson.decodeFromString<LoginRequestDto>(example.toString())
            assertEquals(example, BraidJson.encodeToJsonElement(LoginRequestDto.serializer(), dto))
        }
    }

    @Test
    fun `the refresh body matches the fixture`() {
        val expected = Fixtures.json("session-refresh-request") as JsonObject

        assertEquals(expected, BraidJson.encodeToJsonElement(RefreshRequestDto.serializer(), RefreshRequestDto("refresh-token-opaco")))
    }
}
