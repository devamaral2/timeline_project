package app.braid.mobile.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
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
import app.braid.mobile.core.designsystem.Motion
import app.braid.mobile.domain.chat.ChatCommand
import app.braid.mobile.domain.session.SessionState
import app.braid.mobile.ui.agenda.AgendaScreen
import app.braid.mobile.ui.auth.LoginScreen
import app.braid.mobile.ui.chat.ChatCommandHandlers
import app.braid.mobile.ui.chat.ChatEntityLinks
import app.braid.mobile.ui.chat.ChatOverlay
import app.braid.mobile.ui.chat.ChatViewModel
import app.braid.mobile.ui.chat.FlightKind
import app.braid.mobile.ui.chat.HermesFlight
import app.braid.mobile.ui.chat.HermesFlyer
import app.braid.mobile.ui.chat.LocalEntitiesChanged
import app.braid.mobile.ui.chat.LocalHermesFlight
import app.braid.mobile.ui.chat.MarkRole
import app.braid.mobile.ui.chat.rememberReducedMotion
import app.braid.mobile.ui.documents.DocumentDetailPage
import app.braid.mobile.ui.documents.DocumentEditPage
import app.braid.mobile.ui.documents.DocumentsScreen
import app.braid.mobile.ui.notifications.NotificationsScreen
import app.braid.mobile.ui.reminders.ReminderPrompts
import app.braid.mobile.ui.search.SearchResult
import app.braid.mobile.ui.search.SearchScreen
import app.braid.mobile.ui.search.SearchViewModel
import app.braid.mobile.ui.settings.SettingsScreen
import app.braid.mobile.ui.settings.SettingsViewModel
import app.braid.mobile.ui.shell.BraidBottomBar
import app.braid.mobile.ui.shell.ExecutionDrawer
import app.braid.mobile.ui.shell.ExecutionDrawerLayout
import app.braid.mobile.ui.shell.ExecutionDrawerViewModel
import app.braid.mobile.ui.shell.ExecutionReserve
import app.braid.mobile.ui.shell.LocalExecutionReserve
import app.braid.mobile.ui.shell.LocalSectionMenus
import app.braid.mobile.ui.shell.MainTab
import app.braid.mobile.ui.shell.SectionMenuBody
import app.braid.mobile.ui.shell.SectionMenuViewModel
import app.braid.mobile.ui.shell.SectionMenus
import app.braid.mobile.ui.shell.executionDrawerShown
import app.braid.mobile.ui.taskdetail.TaskDetailPage
import app.braid.mobile.ui.taskedit.TaskEditPage
import app.braid.mobile.ui.tasks.TasksScreen
import kotlinx.coroutines.delay

@Composable
fun AppNavHost(
    openTaskId: String? = null,
    onOpenTaskHandled: () -> Unit = {},
    openChat: Boolean = false,
    onOpenChatHandled: () -> Unit = {},
    gate: SessionGateViewModel = hiltViewModel(),
    sectionMenu: SectionMenuViewModel = hiltViewModel(),
    chat: ChatViewModel = hiltViewModel(),
    settings: SettingsViewModel = hiltViewModel(),
    search: SearchViewModel = hiltViewModel(),
    execution: ExecutionDrawerViewModel = hiltViewModel(),
) {
    val session by gate.state.collectAsStateWithLifecycle()
    val mode by sectionMenu.mode.collectAsStateWithLifecycle()
    val chatState by chat.state.collectAsStateWithLifecycle()
    // Em segundo plano o chat deixa de reler o pedido em andamento e retoma ao voltar.
    LifecycleResumeEffect(chat) {
        chat.setVisible(true)
        onPauseOrDispose { chat.setVisible(false) }
    }
    val executionState by execution.state.collectAsStateWithLifecycle()
    // A gaveta de execução só relê com o app à vista; a tela dela é a das três abas (abaixo).
    LifecycleResumeEffect(execution) {
        execution.setForeground(true)
        onPauseOrDispose { execution.setForeground(false) }
    }
    // Cada tela reserva no fim da rolagem a altura que a gaveta ocupa agora.
    val executionReserve = remember { ExecutionReserve() }
    val menus = remember { SectionMenus() }
    var menuOpen by rememberSaveable { mutableStateOf(false) }
    // "Configurações" do `/configuracoes`: abre dentro do painel do chat, como no web, e o voltar leva ao chat.
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    // A pesquisa aberta no painel do chat, com o texto que veio depois de `/buscar`; nula, fechada.
    var searchArgument by rememberSaveable { mutableStateOf<String?>(null) }
    // O voo do botão do Hermes entre a barra e o ícone de status do chat ou de um detalhe.
    val flight = remember { HermesFlight() }
    flight.reduced = rememberReducedMotion()
    // Abrir o chat manda o botão voar até o status; fechar o traz de volta, com o painel à vista até o pouso.
    remember(chatState.open) {
        if (chatState.open) flight.chatOpened() else flight.chatClosed()
        chatState.open
    }
    val navController = rememberNavController()
    val destination = navController.currentBackStackEntryAsState().value?.destination
    val currentTab =
        when {
            destination?.hasRoute(TasksRoute::class) == true -> MainTab.Tasks
            destination?.hasRoute(AgendaRoute::class) == true -> MainTab.Agenda
            destination?.hasRoute(DocumentsRoute::class) == true -> MainTab.Documents
            else -> null
        }

    LaunchedEffect(currentTab != null && session is SessionState.SignedIn) {
        execution.setActive(currentTab != null && session is SessionState.SignedIn)
    }

    // Trocar de seção, ou sair delas, fecha o menu; o voltar do sistema o fecha antes de qualquer outra coisa.
    LaunchedEffect(currentTab) { menuOpen = false }
    BackHandler(enabled = menuOpen) { menuOpen = false }
    // O voltar do sistema fecha o chat antes do resto.
    BackHandler(enabled = chatState.open) { chat.close() }
    BackHandler(enabled = chatState.open && settingsOpen) { settingsOpen = false }
    BackHandler(enabled = chatState.open && searchArgument != null) { searchArgument = null }
    // Fechar o chat (aba, voltar, sessão perdida) fecha também as configurações que estavam nele.
    LaunchedEffect(chatState.open) {
        if (!chatState.open) {
            settingsOpen = false
            searchArgument = null
        }
    }

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
                    // `/nota ideias` abre a criação do artefato já com o nome; o chat fecha para a tela aparecer.
                    ChatCommand.Document to { argument ->
                        chat.close()
                        navController.navigate(NewDocumentRoute(argument.trim().ifEmpty { null }))
                    },
                    // As configurações abrem dentro do painel do chat, como no web.
                    // `/buscar viagem` abre a pesquisa no painel do chat, já buscando o texto.
                    ChatCommand.Search to { argument -> searchArgument = argument },
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

    // O gesto do assistente do sistema abre o chat depois de entrar; sem sessão, o pedido se perde em vez de abrir o chat
    // no próximo login.
    LaunchedEffect(session, openChat) {
        if (!openChat) return@LaunchedEffect
        when (session) {
            is SessionState.SignedIn -> {
                // O gesto do assistente sempre começa uma conversa nova, mesmo com o chat já aberto.
                chat.startNewConversation()
                if (!chatState.open) chat.open()
                onOpenChatHandled()
            }
            SessionState.SignedOut -> onOpenChatHandled()
            SessionState.Unknown -> Unit
        }
    }

    // A barra avisa ao voo quando aparece ou sai (entrar num detalhe a esconde).
    SideEffect { flight.barChanged(currentTab != null) }
    // A barra que sai se apaga em `barAway` (Motion); voltando de um detalhe, reaparece depois que o botão começa a voltar.
    val barAlpha = remember { Animatable(1f) }
    var lastTab by remember { mutableStateOf(currentTab) }
    if (currentTab != null) SideEffect { lastTab = currentTab }
    val undocking = flight.current?.kind == FlightKind.Undock
    LaunchedEffect(currentTab != null, undocking) {
        when {
            currentTab == null -> barAlpha.animateTo(0f, tween(BAR_AWAY_MS))
            undocking -> {
                barAlpha.snapTo(0f)
                delay(BAR_RETURN_DELAY_MS)
                barAlpha.animateTo(1f, tween(BAR_RETURN_MS))
            }
            else -> barAlpha.snapTo(1f)
        }
    }
    // O painel do chat entra `flightLandDelay` (Motion) depois de o botão partir e, na volta, se apaga enquanto ele voa.
    val panelFlight = flight.current?.takeIf { it.role == MarkRole.Chat }
    val panelAlpha = remember(panelFlight?.serial) { Animatable(if (panelFlight?.kind == FlightKind.Out) 0f else 1f) }
    LaunchedEffect(panelFlight?.serial) {
        when (panelFlight?.kind) {
            FlightKind.Out -> {
                delay(PANEL_ENTER_DELAY_MS)
                panelAlpha.animateTo(1f, tween(PANEL_ENTER_MS))
            }
            FlightKind.Back -> panelAlpha.animateTo(0f, tween(PANEL_AWAY_MS))
            else -> Unit
        }
    }
    val chatShown = chatState.open || panelFlight?.kind == FlightKind.Back

    CompositionLocalProvider(
        LocalSectionMenus provides menus,
        LocalEntitiesChanged provides chat.entitiesChanged,
        LocalHermesFlight provides flight,
        LocalExecutionReserve provides executionReserve,
    ) {
        Box(Modifier.fillMaxSize()) {
            NavHost(
                navController = navController,
                startDestination = LoginRoute,
                // O padrão do Navigation é um fade de 700 ms; aqui, esse tempo de desenho na escala do Motion, na entrada, na saída e na volta.
                enterTransition = { fadeIn(tween(NAV_FADE_MS)) },
                exitTransition = { fadeOut(tween(NAV_FADE_MS)) },
                popEnterTransition = { fadeIn(tween(NAV_FADE_MS)) },
                popExitTransition = { fadeOut(tween(NAV_FADE_MS)) },
            ) {
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
                        // Excluído, o artefato some: volta para a lista, não para a leitura dele.
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
            if (chatShown) {
                ChatOverlay(chat, commands, links, Modifier.graphicsLayer { alpha = panelAlpha.value })
                if (settingsOpen) SettingsScreen(settings, onBack = { settingsOpen = false })
                searchArgument?.let { argument ->
                    SearchScreen(
                        search,
                        argument = argument,
                        onBack = { searchArgument = null },
                        // Um resultado abre o detalhe; o chat fecha para mostrá-lo.
                        onOpen = { result ->
                            chat.close()
                            when (result) {
                                is SearchResult.Task -> navController.navigate(TaskDetailRoute(result.id))
                                is SearchResult.Document -> navController.navigate(DocumentDetailRoute(result.id))
                            }
                        },
                    )
                }
            }
            if (session is SessionState.SignedIn) ReminderPrompts(Modifier.align(Alignment.TopCenter))
            val barTab = currentTab ?: lastTab.takeIf { barAlpha.value > 0f }
            if (barTab != null) {
                if (menuOpen && currentTab != null) {
                    // Tocar fora do menu o fecha; o scrim não pinta nada.
                    Box(
                        Modifier
                            .fillMaxSize()
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) {
                                menuOpen = false
                            },
                    )
                }
                val model = menus[barTab]
                BraidBottomBar(
                    current = barTab,
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
                            tab == barTab -> menuOpen = !menuOpen
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
                    modifier = Modifier.align(Alignment.BottomCenter).graphicsLayer { alpha = barAlpha.value },
                    menu = {
                        SectionMenuBody(
                            tab = barTab,
                            model = model,
                            mode = mode,
                            open = menuOpen,
                            onSelectMode = sectionMenu::select,
                            onClose = { menuOpen = false },
                        )
                    },
                )
            }
            // A gaveta de execução, acima da barra e por cima do degradê dela; nas três abas, com a mesma altura.
            ExecutionDrawer(
                state = executionState,
                shown = executionDrawerShown(barTab, executionState.runs.isNotEmpty(), chatState.open, menuOpen),
                reserve = executionReserve,
                onSetMode = execution::setMode,
                onOpenTask = { navController.navigate(TaskDetailRoute(it)) },
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(bottom = ExecutionDrawerLayout.NavigationHeight)
                        .graphicsLayer { alpha = barAlpha.value },
            )
            // Por cima de tudo, o disco que voa entre a barra e o ícone de status.
            HermesFlyer(flight, chatState.bot)
        }
    }
}

/** O fade padrão do Navigation (700 ms no desenho), só do Android, na escala do Motion. */
private val NAV_FADE_MS = Motion.ms(700)
private const val BAR_AWAY_MS = Motion.BAR_AWAY_MS
private const val BAR_RETURN_DELAY_MS = Motion.BAR_RETURN_DELAY_MS.toLong()
private const val BAR_RETURN_MS = Motion.BAR_RETURN_MS
private const val PANEL_ENTER_DELAY_MS = Motion.FLIGHT_LAND_DELAY_MS.toLong()
private const val PANEL_ENTER_MS = Motion.FLIGHT_LAND_MS
private const val PANEL_AWAY_MS = Motion.PANEL_AWAY_MS

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
