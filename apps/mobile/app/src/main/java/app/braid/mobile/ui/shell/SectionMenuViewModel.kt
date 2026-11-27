package app.braid.mobile.ui.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.executor.ViewModeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** A escolha de executor do menu: uma só para Agenda, Tarefas e Artefatos, guardada no aparelho. */
@HiltViewModel
class SectionMenuViewModel
    @Inject
    constructor(
        private val modes: ViewModeRepository,
    ) : ViewModel() {
        val mode: StateFlow<ViewMode> = modes.mode.stateIn(viewModelScope, SharingStarted.Eagerly, ViewMode.Default)

        fun select(mode: ViewMode) {
            viewModelScope.launch { modes.select(mode) }
        }
    }
