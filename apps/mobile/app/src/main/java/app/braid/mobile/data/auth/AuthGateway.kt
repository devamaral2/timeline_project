package app.braid.mobile.data.auth

interface AuthGateway {
    suspend fun login(
        email: String,
        password: String,
    ): AuthResult<SessionTokensDto>

    suspend fun refresh(refreshToken: String): AuthResult<SessionTokensDto>

    suspend fun logout(refreshToken: String): AuthResult<Unit>

    suspend fun me(accessToken: String): AuthResult<AuthUserDto>
}
