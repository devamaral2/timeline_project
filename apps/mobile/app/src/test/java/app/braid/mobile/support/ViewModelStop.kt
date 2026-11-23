package app.braid.mobile.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking

/**
 * Termina o ViewModel de um teste e espera as corrotinas dele acabarem de verdade, antes de o `Main` de teste ser solto e
 * o servidor fechado. Sem isso, uma leitura ainda em voo termina depois do `resetMain` e tenta o `Looper` do Android, que
 * nos testes de unidade não existe: o erro sobe numa thread de rede e o teste que estiver rodando então é quem falha.
 */
fun ViewModel.stopAndJoin() {
    runBlocking { viewModelScope.coroutineContext[Job]?.cancelAndJoin() }
}
