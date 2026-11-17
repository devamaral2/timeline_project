package app.braid.mobile.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.ui.auth.LoginScreen
import app.braid.mobile.ui.home.SignedInScreen

@Composable
fun AppNavHost(gate: SessionGateViewModel = hiltViewModel()) {
    val session by gate.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    // A sessão manda: entrar abre o app, e perdê-la (renovação recusada, sair) volta ao login.
    LaunchedEffect(session) {
        val target: Any =
            when (session) {
                is SessionState.SignedIn -> SignedInRoute
                SessionState.SignedOut -> LoginRoute
                SessionState.Unknown -> return@LaunchedEffect
            }
        navController.navigate(target) {
            popUpTo(navController.graph.id) { inclusive = true }
            launchSingleTop = true
        }
    }

    NavHost(navController = navController, startDestination = LoginRoute) {
        composable<LoginRoute> { if (session !is SessionState.Unknown) LoginScreen() }
        composable<SignedInRoute> { (session as? SessionState.SignedIn)?.let { SignedInScreen(it.user) } }
    }
}
