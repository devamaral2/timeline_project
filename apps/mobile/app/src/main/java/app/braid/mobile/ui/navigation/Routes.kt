package app.braid.mobile.ui.navigation

import kotlinx.serialization.Serializable

/** Rotas tipadas do Navigation Compose; cada ticket de tela acrescenta as suas aqui. */
@Serializable
data object LoginRoute

/** Tela provisória do pós-login; a Agenda a substitui. */
@Serializable
data object SignedInRoute
