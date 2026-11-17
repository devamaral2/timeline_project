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
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.braid.mobile.domain.chat.ChatCommand
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.ui.agenda.AgendaScreen
import app.braid.mobile.ui.auth.LoginScreen
import app.braid.mobile.ui.chat.ChatCommandHandlers
import app.braid.mobile.ui.chat.ChatEntityLinks
import app.braid.mobile.ui.chat.ChatOverlay
import app.braid.mobile.ui.chat.ChatViewModel
import app.braid.mobile.ui.chat.LocalEntitiesChanged
import app.braid.mobile.ui.documents.DocumentDetailPage
import app.braid.mobile.ui.documents.DocumentEditPage
import app.braid.mobile.ui.documents.DocumentsScreen
import app.braid.mobile.ui.notifications.NotificationsScreen
import app.braid.mobile.ui.reminders.ReminderPrompts
import app.braid.mobile.ui.settings.SettingsScreen
import app.braid.mobile.ui.settings.SettingsViewModel
import app.braid.mobile.ui.shell.BraidBottomBar
import app.braid.mobile.ui.shell.LocalSectionMenus
import app.braid.mobile.ui.shell.MainTab
import app.braid.mobile.ui.shell.SectionMenuBody
import app.braid.mobile.ui.shell.SectionMenuViewModel
import app.braid.mobile.ui.shell.SectionMenus
import app.braid.mobile.ui.taskdetail.TaskDetailPage
import app.braid.mobile.ui.taskedit.TaskEditPage
import app.braid.mobile.ui.tasks.TasksScreen

@Composable
fun AppNavHost(
    openTaskId: String? = null,
    onOpenTaskHandled: () -> Unit = {},
    gate: SessionGateViewModel = hiltViewModel(),
    sectionMenu: SectionMenuViewModel = hiltViewModel(),
    chat: ChatViewModel = hiltViewModel(),
    settings: SettingsViewModel = hiltViewModel(),
) {
    val session by gate.state.collectAsStateWithLifecycle()
    val mode by sectionMenu.mode.collectAsStateWithLifecycle()
    val chatState by chat.state.collectAsStateWithLifecycle()
    // Em segundo plano o chat deixa de reler o pedido em andamento e retoma ao voltar.
    LifecycleResumeEffect(chat) {
        chat.setVisible(true)
        onPauseOrDispose { chat.setVisible(false) }
    }
    val menus = remember { SectionMenus() }
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    // "Configurações" do `/configuracoes`: abre dentro do painel do chat, como no web, e o voltar leva ao chat.
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
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
    BackHandler(enabled = chatState.open && settingsOpen) { settingsOpen = false }
    // Fechar o chat (aba, voltar, sessão perdida) fecha também as configurações que estavam nele.
    LaunchedEffect(chatState.open) { if (!chatState.open) settingsOpen = false }

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
    val commands =
        remember(navController) {
            ChatCommandHandlers(
                mapOf(
                    // `/tarefa comprar pão` abre a criação com o título já preenchido; o chat fecha para mostrá-la.
                    ChatCommand.Task to { argument ->
                        chat.close()
                        navController.navigate(TaskEditRoute(name = argument.ifBlank { null }))
                    },
                    // `/nota ideias` abre a criação do documento já com o nome; o chat fecha para a tela aparecer.
                    ChatCommand.Document to { argument ->
                        chat.close()
                        navController.navigate(NewDocumentRoute(argument.trim().ifEmpty { null }))
                    },
                    // As configurações abrem dentro do painel do chat, como no web.
                    ChatCommand.Settings to { _ -> settingsOpen = true },
                    // `/notificacoes` troca o chat pelo feed; o voltar da tela o reabre.
                    ChatCommand.Notifications to {
                        chat.close()
                        navController.navigate(NotificationsRoute)
                    },
                ),
            )
        }
    val links =
        remember(navController) {
            ChatEntityLinks(
                openTask = { navController.navigate(TaskDetailRoute(it)) },
                openDocument = { navController.navigate(DocumentDetailRoute(it)) },
            )
        }

    // Tocar numa notificação de lembrete abre o detalhe da tarefa por cima da Agenda, depois de entrar.
    LaunchedEffect(session, openTaskId) {
        if (openTaskId != null && session is SessionState.SignedIn) {
            navController.navigate(TaskDetailRoute(openTaskId))
            onOpenTaskHandled()
        }
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
                        onOpenArtifact = { navController.navigate(DocumentDetailRoute(it)) },
                        onEdit = { navController.navigate(TaskEditRoute(taskId = it)) },
                    )
                }
                composable<TaskEditRoute> { TaskEditPage(onLeave = { navController.popBackStack() }) }
                composable<TasksRoute> {
                    TasksScreen(
                        onNewTask = { navController.navigate(TaskEditRoute()) },
                        onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                    )
                }
                composable<DocumentsRoute> { DocumentsScreen(onOpenDocument = { navController.navigate(DocumentDetailRoute(it)) }) }
                composable<DocumentDetailRoute> {
                    DocumentDetailPage(
                        onBack = { navController.popBackStack() },
                        onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                        onEdit = { navController.navigate(EditDocumentRoute(it)) },
                        // Excluído, o documento some: volta para a lista, não para a leitura dele.
                        onDeleted = { navController.openTab(MainTab.Documents) },
                    )
                }
                composable<NotificationsRoute> {
                    NotificationsScreen(
                        onBack = {
                            navController.popBackStack()
                            chat.open()
                        },
                        onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                    )
                }
                composable<NewDocumentRoute> {
                    DocumentEditPage(
                        // Criado, abre a leitura no lugar do formulário; descartar volta para a lista.
                        onSaved = { id ->
                            navController.navigate(DocumentDetailRoute(id)) { popUpTo<NewDocumentRoute> { inclusive = true } }
                        },
                        onDiscard = { navController.openTab(MainTab.Documents) },
                    )
                }
                composable<EditDocumentRoute> {
                    DocumentEditPage(
                        // Salvo, a leitura é lida de novo: troca a que estava por baixo; descartar volta a ela.
                        onSaved = { id ->
                            navController.navigate(DocumentDetailRoute(id)) { popUpTo<DocumentDetailRoute> { inclusive = true } }
                        },
                        onDiscard = { navController.popBackStack() },
                    )
                }
            }
            if (chatState.open) {
                ChatOverlay(chat, commands, links)
                if (settingsOpen) SettingsScreen(settings, onBack = { settingsOpen = false })
            }
            if (session is SessionState.SignedIn) ReminderPrompts(Modifier.align(Alignment.TopCenter))
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
