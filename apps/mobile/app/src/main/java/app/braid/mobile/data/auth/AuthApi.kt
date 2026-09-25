package app.braid.mobile.data.auth

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface AuthApi {
    @POST("auth/login")
    suspend fun login(
        @Body request: LoginRequestDto,
    ): Response<SessionTokensDto>

    @POST("auth/token/refresh")
    suspend fun refresh(
        @Body request: RefreshTokenRequestDto,
    ): Response<SessionTokensDto>

    @POST("auth/logout")
    suspend fun logout(
        @Body request: RefreshTokenRequestDto,
    ): Response<Unit>

    @GET("auth/me")
    suspend fun me(
        @Header("Authorization") authorization: String,
    ): Response<AuthUserDto>
}
