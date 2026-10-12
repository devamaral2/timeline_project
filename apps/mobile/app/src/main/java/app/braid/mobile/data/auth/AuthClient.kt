package app.braid.mobile.data.auth

import app.braid.mobile.data.network.ApiError
import app.braid.mobile.data.network.AuthErrorKind
import app.braid.mobile.data.network.authErrorOf
import retrofit2.Response
import java.io.IOException
import javax.inject.Inject

sealed interface AuthResult<out T> {
    data class Success<T>(
        val value: T,
    ) : AuthResult<T>

    data class Failure(
        val error: ApiError,
    ) : AuthResult<Nothing>
}

class AuthClient
    @Inject
    constructor(
        private val api: AuthApi,
    ) : AuthGateway {
        override suspend fun login(
            email: String,
            password: String,
        ): AuthResult<SessionTokensDto> = call { api.login(LoginRequestDto(email, password)) }

        override suspend fun refresh(refreshToken: String): AuthResult<SessionTokensDto> =
            call {
                api.refresh(RefreshTokenRequestDto(refreshToken))
            }

        override suspend fun logout(refreshToken: String): AuthResult<Unit> = call { api.logout(RefreshTokenRequestDto(refreshToken)) }

        override suspend fun me(accessToken: String): AuthResult<AuthUserDto> = call { api.me("Bearer $accessToken") }

        private suspend fun <T> call(request: suspend () -> Response<T>): AuthResult<T> {
            val response =
                try {
                    request()
                } catch (_: IOException) {
                    return AuthResult.Failure(ApiError(AuthErrorKind.Unavailable, 503))
                }

            if (!response.isSuccessful) return AuthResult.Failure(authErrorOf(response))
            return response.body()?.let { AuthResult.Success(it) }
                ?: AuthResult.Failure(ApiError(AuthErrorKind.Protocol, 502))
        }
    }
