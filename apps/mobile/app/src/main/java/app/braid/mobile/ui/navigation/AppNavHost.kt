package app.braid.mobile.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.ui.agenda.AgendaScreen
import app.braid.mobile.ui.auth.LoginScreen
import app.braid.mobile.ui.shell.BraidBottomBar
import app.braid.mobile.ui.shell.EmptyTabScreen
import app.braid.mobile.ui.shell.MainTab

@Composable
fun AppNavHost(gate: SessionGateViewModel = hiltViewModel()) {
    val session by gate.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val destination = navController.currentBackStackEntryAsState().value?.destination
    val currentTab =
        when {
            destination?.hasRoute(TasksRoute::class) == true -> MainTab.Tasks
            destination?.hasRoute(AgendaRoute::class) == true -> MainTab.Agenda
            destination?.hasRoute(DocumentsRoute::class) == true -> MainTab.Documents
            else -> null
        }

    // A sessão manda: entrar abre a Agenda, e perdê-la (renovação recusada, sair) volta ao login.
    LaunchedEffect(session) {
        val target: Any =
            when (session) {
                is SessionState.SignedIn -> AgendaRoute
                SessionState.SignedOut -> LoginRoute
                SessionState.Unknown -> return@LaunchedEffect
            }
        navController.navigate(target) {
            popUpTo(navController.graph.id) { inclusive = true }
            launchSingleTop = true
        }
    }

    Box(Modifier.fillMaxSize()) {
        NavHost(navController = navController, startDestination = LoginRoute) {
            composable<LoginRoute> { if (session !is SessionState.Unknown) LoginScreen() }
            composable<AgendaRoute> { AgendaScreen() }
            composable<TasksRoute> { EmptyTabScreen() }
            composable<DocumentsRoute> { EmptyTabScreen() }
        }
        if (currentTab != null) {
            BraidBottomBar(
                current = currentTab,
                onSelectTab = { navController.openTab(it) },
                onAgent = {},
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

/** Trocar de seção desfaz o que está acima da Agenda: dela o voltar sai do app, das outras volta a ela. */
private fun NavHostController.openTab(tab: MainTab) {
    val route: Any =
        when (tab) {
            MainTab.Tasks -> TasksRoute
            MainTab.Agenda -> AgendaRoute
            MainTab.Documents -> DocumentsRoute
        }
    navigate(route) {
        popUpTo<AgendaRoute> { inclusive = false }
        launchSingleTop = true
    }
}
