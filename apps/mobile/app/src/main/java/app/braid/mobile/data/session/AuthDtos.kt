package app.braid.mobile.data.session

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequestDto(
    val email: String,
    val password: String,
)

@Serializable
data class RefreshRequestDto(
    val refreshToken: String,
)

@Serializable
data class SessionTokensDto(
    val accessToken: String,
    val refreshToken: String,
    val accessTokenExpiresInSeconds: Long? = null,
    val refreshTokenExpiresAt: String? = null,
)

/** O Auth só devolve o par novo ao renovar; a validade do access token vem do próprio JWT. */
@Serializable
data class RefreshedTokensDto(
    val accessToken: String,
    val refreshToken: String,
)

@Serializable
data class CurrentUserDto(
    val userId: String,
    val email: String,
    val name: String,
    val sessionId: String,
    val roles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val denies: List<String> = emptyList(),
)
