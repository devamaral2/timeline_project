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
import app.braid.mobile.ui.chat.ChatCommandHandlers
import app.braid.mobile.ui.chat.ChatEntityLinks
import app.braid.mobile.ui.chat.ChatOverlay
import app.braid.mobile.ui.chat.ChatViewModel
import app.braid.mobile.ui.chat.LocalEntitiesChanged
import app.braid.mobile.ui.shell.BraidBottomBar
import app.braid.mobile.ui.shell.EmptyTabScreen
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
    chat: ChatViewModel = hiltViewModel(),
) {
    val session by gate.state.collectAsStateWithLifecycle()
    val mode by sectionMenu.mode.collectAsStateWithLifecycle()
    val chatState by chat.state.collectAsStateWithLifecycle()
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
    // O voltar do sistema fecha o chat antes do resto.
    BackHandler(enabled = chatState.open) { chat.close() }

    // A sessão manda: entrar abre a Agenda, e perdê-la (renovação recusada, sair) volta ao login.
    LaunchedEffect(session) {
        val target: Any =
            when (session) {
                is SessionState.SignedIn -> AgendaRoute
                SessionState.SignedOut -> LoginRoute
                SessionState.Unknown -> return@LaunchedEffect
            }
        if (session == SessionState.SignedOut) chat.close()
        navController.navigate(target) {
            popUpTo(navController.graph.id) { inclusive = true }
            launchSingleTop = true
        }
    }

    // Os comandos "/" do chat e os atalhos da tela inicial: cada ticket que entrega uma tela acrescenta a sua entrada
    // (`/tarefa` e `/nota`, `/notificacoes`, `/configuracoes`).
    val commands = remember { ChatCommandHandlers() }
    val links =
        remember(navController) {
            // O destino de um documento chega com a tela de documentos; até lá a linha é só texto.
            ChatEntityLinks(openTask = { navController.navigate(TaskDetailRoute(it)) })
        }

    CompositionLocalProvider(LocalSectionMenus provides menus, LocalEntitiesChanged provides chat.entitiesChanged) {
        Box(Modifier.fillMaxSize()) {
            NavHost(navController = navController, startDestination = LoginRoute) {
                composable<LoginRoute> { if (session !is SessionState.Unknown) LoginScreen() }
                composable<AgendaRoute> {
                    AgendaScreen(
                        onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                        // Tocar numa janela livre abre o chat numa conversa nova, com a janela anexada.
                        onPlanFreeWindow = {
                            menuOpen = false
                            chat.openWithFreeWindow(it)
                        },
                    )
                }
                composable<TaskDetailRoute> {
                    TaskDetailPage(
                        onBack = { navController.popBackStack() },
                        onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                    )
                }
                // "Nova tarefa" leva à criação quando o ticket 13 existir.
                composable<TasksRoute> { TasksScreen(onNewTask = {}, onOpenTask = { navController.navigate(TaskDetailRoute(it)) }) }
                composable<DocumentsRoute> { EmptyTabScreen() }
            }
            if (chatState.open) ChatOverlay(chat, commands, links)
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
                        when {
                            // Com o chat aberto, o toque numa aba só o fecha (e navega, se for outra).
                            chatState.open -> {
                                chat.close()
                                if (tab != currentTab) navController.openTab(tab)
                            }
                            // Tocar na aba já selecionada abre ou fecha o menu; em outra, só navega.
                            tab == currentTab -> menuOpen = !menuOpen
                            else -> navController.openTab(tab)
                        }
                    },
                    bot = chatState.bot,
                    chatOpen = chatState.open,
                    onAgent = {
                        if (chatState.open) {
                            chat.close()
                        } else {
                            menuOpen = false
                            chat.open()
                        }
                    },
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
