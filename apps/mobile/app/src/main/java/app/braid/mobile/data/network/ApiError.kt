package app.braid.mobile.data.network

import retrofit2.Response

enum class AuthErrorKind {
    InvalidCredentials,
    RateLimited,
    Unavailable,
    Protocol,
}

data class ApiError(
    val kind: AuthErrorKind,
    val status: Int,
    val retryAfter: String? = null,
)

fun authErrorOf(response: Response<*>): ApiError {
    val retryAfter = response.headers()["Retry-After"]
    return when {
        response.code() == 429 -> ApiError(AuthErrorKind.RateLimited, response.code(), retryAfter)
        response.code() in 400..499 -> ApiError(AuthErrorKind.InvalidCredentials, response.code(), retryAfter)
        response.code() >= 500 -> ApiError(AuthErrorKind.Unavailable, response.code(), retryAfter)
        else -> ApiError(AuthErrorKind.Protocol, response.code(), retryAfter)
    }
}
