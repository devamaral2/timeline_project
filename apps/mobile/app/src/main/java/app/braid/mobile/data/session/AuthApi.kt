package app.braid.mobile.data.session

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

/** O que o app fala direto com o Auth; o web chega ao mesmo lugar pelo proxy do Next. */
interface AuthApi {
    @POST("auth/login")
    suspend fun login(
        @Body request: LoginRequestDto,
    ): Response<SessionTokensDto>

    @POST("auth/token/refresh")
    suspend fun refresh(
        @Body request: RefreshRequestDto,
    ): Response<RefreshedTokensDto>

    @POST("auth/logout")
    suspend fun logout(
        @Body request: RefreshRequestDto,
    ): Response<Unit>

    @GET("auth/me")
    suspend fun me(
        @Header("Authorization") authorization: String,
    ): Response<CurrentUserDto>
}
