package app.braid.mobile.ui.reminders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.reminder.ExactAlarmPromptRepository
import app.braid.mobile.domain.reminder.ReminderAlarms
import app.braid.mobile.domain.reminder.ReminderScheduleStore
import app.braid.mobile.domain.reminder.shouldExplainExactAlarm
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Se a faixa que pede a permissão de alarme exato aparece agora; a tela chama [refresh] ao voltar das configurações. */
@HiltViewModel
class ExactAlarmViewModel
    @Inject
    constructor(
        private val alarms: ReminderAlarms,
        private val schedule: ReminderScheduleStore,
        private val prompt: ExactAlarmPromptRepository,
    ) : ViewModel() {
        private val mutableExplain = MutableStateFlow(false)
        val explain: StateFlow<Boolean> = mutableExplain

        /** Relê a permissão e o cronograma guardado: o usuário pode ter dado a permissão fora do app. */
        fun refresh() {
            viewModelScope.launch {
                mutableExplain.value =
                    shouldExplainExactAlarm(
                        canScheduleExact = alarms.canScheduleExact(),
                        dismissed = prompt.dismissed.first(),
                        hasSavedReminders = schedule.read().isNotEmpty(),
                    )
            }
        }

        fun dismiss() {
            mutableExplain.value = false
            viewModelScope.launch { prompt.markDismissed() }
        }
    }
