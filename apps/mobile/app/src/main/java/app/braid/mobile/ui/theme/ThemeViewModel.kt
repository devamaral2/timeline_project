package app.braid.mobile.ui.theme

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.preferences.ThemeChoice
import app.braid.mobile.data.preferences.ThemePreference
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ThemeViewModel
    @Inject
    constructor(
        private val preference: ThemePreference,
    ) : ViewModel() {
        val choice: StateFlow<ThemeChoice?> =
            preference.choice.stateIn(viewModelScope, SharingStarted.Eagerly, null)

        /** Fixa o oposto do tema que está na tela agora (“Tema escuro” ↔ “Tema claro”). */
        fun toggle(currentlyDark: Boolean) {
            viewModelScope.launch {
                preference.set(if (currentlyDark) ThemeChoice.Light else ThemeChoice.Dark)
            }
        }
    }
