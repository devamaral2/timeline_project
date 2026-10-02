package app.braid.mobile.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.data.session.SessionState
import app.braid.mobile.ui.agenda.AgendaShell
import app.braid.mobile.ui.auth.LoginScreen
import app.braid.mobile.ui.chat.AgentChatViewModel
import app.braid.mobile.ui.event.CreateEventScreen
import app.braid.mobile.ui.event.EventDetailScreen
import app.braid.mobile.ui.voice.VoiceEventQueueViewModel

@Composable
@Suppress("ktlint:standard:function-naming")
fun AppNavHost(
    reminderScheduler: ReminderScheduler? = null,
    initialEventId: String? = null,
    viewModel: SessionGateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    var agendaRefreshSignal by remember { mutableIntStateOf(0) }

    when (val session = state) {
        SessionState.Unknown -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }
        SessionState.SignedOut -> LoginScreen()
        is SessionState.SignedIn -> {
            LaunchedEffect(session.user.userId, initialEventId) {
                initialEventId?.let { eventId ->
                    navController.navigate("event/$eventId") { launchSingleTop = true }
                }
            }
            NavHost(
                navController = navController,
                startDestination = "agenda",
                modifier = Modifier.fillMaxSize(),
            ) {
                composable("agenda") {
                    AgendaShell(
                        user = session.user,
                        onSignOut = viewModel::signOut,
                        onNewEvent = { navController.navigate("new-event") },
                        onOpenEvent = { eventId -> navController.navigate("event/$eventId") },
                        onVoiceQueueDrained = { agendaRefreshSignal += 1 },
                        onChatEntitiesChanged = { agendaRefreshSignal += 1 },
                        voiceQueueViewModel = hiltViewModel<VoiceEventQueueViewModel>(),
                        agentChatViewModel = hiltViewModel<AgentChatViewModel>(),
                        reminderScheduler = reminderScheduler,
                        refreshSignal = agendaRefreshSignal,
                    )
                }
                composable(
                    route = "event/{eventId}",
                    arguments = listOf(navArgument("eventId") { type = NavType.StringType }),
                ) { entry ->
                    val eventId = entry.arguments?.getString("eventId")
                    if (eventId == null) {
                        navController.popBackStack()
                    } else {
                        EventDetailScreen(
                            eventId = eventId,
                            onBack = { navController.popBackStack() },
                            onEdit = { navController.navigate("edit/$eventId") },
                            onDeleted = {
                                reminderScheduler?.cancel(eventId)
                                agendaRefreshSignal += 1
                                navController.popBackStack("agenda", inclusive = false)
                            },
                        )
                    }
                }
                composable(
                    route = "edit/{eventId}",
                    arguments = listOf(navArgument("eventId") { type = NavType.StringType }),
                ) { entry ->
                    val eventId = entry.arguments?.getString("eventId")
                    if (eventId == null) {
                        navController.popBackStack()
                    } else {
                        app.braid.mobile.ui.event.EditEventScreen(
                            eventId = eventId,
                            onBack = { navController.popBackStack() },
                            onSaved = {
                                agendaRefreshSignal += 1
                                navController.popBackStack("agenda", inclusive = false)
                            },
                        )
                    }
                }
                composable("new-event") {
                    CreateEventScreen(
                        onBack = { navController.popBackStack() },
                        onCreated = {
                            agendaRefreshSignal += 1
                            navController.popBackStack()
                        },
                    )
                }
            }
        }
    }
}
