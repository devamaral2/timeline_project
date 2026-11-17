package app.braid.mobile.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
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
import app.braid.mobile.ui.documents.DocumentDetailPage
import app.braid.mobile.ui.documents.DocumentsScreen
import app.braid.mobile.ui.shell.BraidBottomBar
import app.braid.mobile.ui.shell.LocalSectionMenus
import app.braid.mobile.ui.shell.MainTab
import app.braid.mobile.ui.shell.SectionMenuBody
import app.braid.mobile.ui.shell.SectionMenuViewModel
import app.braid.mobile.ui.shell.SectionMenus
import app.braid.mobile.ui.taskdetail.TaskDetailPage
import app.braid.mobile.ui.tasks.TasksScreen

@Composable
fun AppNavHost(
    gate: SessionGateViewModel = hiltViewModel(),
    sectionMenu: SectionMenuViewModel = hiltViewModel(),
) {
    val session by gate.state.collectAsStateWithLifecycle()
    val mode by sectionMenu.mode.collectAsStateWithLifecycle()
    val menus = remember { SectionMenus() }
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    val navController = rememberNavController()
    val destination = navController.currentBackStackEntryAsState().value?.destination
    val currentTab =
        when {
            destination?.hasRoute(TasksRoute::class) == true -> MainTab.Tasks
            destination?.hasRoute(AgendaRoute::class) == true -> MainTab.Agenda
            destination?.hasRoute(DocumentsRoute::class) == true -> MainTab.Documents
            else -> null
        }

    // Trocar de seção, ou sair delas, fecha o menu; o voltar do sistema o fecha antes de qualquer outra coisa.
    LaunchedEffect(currentTab) { menuOpen = false }
    BackHandler(enabled = menuOpen) { menuOpen = false }

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

    CompositionLocalProvider(LocalSectionMenus provides menus) {
        Box(Modifier.fillMaxSize()) {
            NavHost(navController = navController, startDestination = LoginRoute) {
                composable<LoginRoute> { if (session !is SessionState.Unknown) LoginScreen() }
                composable<AgendaRoute> { AgendaScreen(onOpenTask = { navController.navigate(TaskDetailRoute(it)) }) }
                composable<TaskDetailRoute> {
                    TaskDetailPage(
                        onBack = { navController.popBackStack() },
                        onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                        // O detalhe do documento chega com o ticket 11; até lá o toque no que o pedido produziu não leva a lugar nenhum.
                        onOpenArtifact = {},
                    )
                }
                // "Nova tarefa" leva à criação quando o ticket 13 existir.
                composable<TasksRoute> { TasksScreen(onNewTask = {}, onOpenTask = { navController.navigate(TaskDetailRoute(it)) }) }
                composable<DocumentsRoute> { DocumentsScreen(onOpenDocument = { navController.navigate(DocumentDetailRoute(it)) }) }
                composable<DocumentDetailRoute> {
                    DocumentDetailPage(
                        onBack = { navController.popBackStack() },
                        onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                    )
                }
            }
            if (currentTab != null) {
                if (menuOpen) {
                    // Tocar fora do menu o fecha; o scrim não pinta nada.
                    Box(
                        Modifier
                            .fillMaxSize()
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) {
                                menuOpen = false
                            },
                    )
                }
                val model = menus[currentTab]
                BraidBottomBar(
                    current = currentTab,
                    mode = mode,
                    menuOpen = menuOpen,
                    filtered = model?.filtered == true,
                    onSelectTab = { tab ->
                        // Tocar na aba já selecionada abre ou fecha o menu; em outra, só navega.
                        if (tab == currentTab) menuOpen = !menuOpen else navController.openTab(tab)
                    },
                    onAgent = {},
                    modifier = Modifier.align(Alignment.BottomCenter),
                    menu = {
                        SectionMenuBody(
                            tab = currentTab,
                            model = model,
                            mode = mode,
                            open = menuOpen,
                            onSelectMode = sectionMenu::select,
                            onClose = { menuOpen = false },
                        )
                    },
                )
            }
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
