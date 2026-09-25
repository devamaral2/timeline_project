package app.braid.mobile.data.auth

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequestDto(
    val email: String,
    val password: String,
)

@Serializable
data class RefreshTokenRequestDto(
    val refreshToken: String,
)

@Serializable
data class SessionTokensDto(
    val accessToken: String,
    val refreshToken: String,
    val accessTokenExpiresInSeconds: Long? = null,
    val refreshTokenExpiresAt: String? = null,
)

@Serializable
data class AuthUserDto(
    val userId: String,
    val email: String,
    val name: String,
    val sessionId: String,
    val roles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val denies: List<String> = emptyList(),
)
