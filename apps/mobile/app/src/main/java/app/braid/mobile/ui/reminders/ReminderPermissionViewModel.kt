package app.braid.mobile.ui.reminders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.reminder.NotificationPermissionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Se o app já pediu a permissão de notificação: o sistema só pergunta duas vezes, então o app pergunta uma e depois explica. */
@HiltViewModel
class ReminderPermissionViewModel
    @Inject
    constructor(
        private val permission: NotificationPermissionRepository,
    ) : ViewModel() {
        /** `null` até ler o armazenamento. */
        val asked: StateFlow<Boolean?> = permission.asked.stateIn(viewModelScope, SharingStarted.Eagerly, null)

        fun markAsked() {
            viewModelScope.launch { permission.markAsked() }
        }
    }
