package app.braid.mobile.ui.reminders

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.IOException
import javax.inject.Inject

private val ASKED = booleanPreferencesKey("notification_permission_asked")

/** Se o app já pediu a permissão de notificação: o sistema só pergunta duas vezes, então o app pergunta uma e depois explica. */
@HiltViewModel
class ReminderPermissionViewModel
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : ViewModel() {
        /** `null` até ler o DataStore. */
        val asked: StateFlow<Boolean?> =
            store.data
                .catch { failure -> if (failure is IOException) emit(emptyPreferences()) else throw failure }
                .map { it[ASKED] ?: false }
                .stateIn(viewModelScope, SharingStarted.Eagerly, null)

        fun markAsked() {
            viewModelScope.launch { store.edit { it[ASKED] = true } }
        }
    }
