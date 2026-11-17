package app.braid.mobile.ui.shell

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateMapOf
import app.braid.mobile.core.designsystem.SvgPart

/**
 * O menu da seção mora no shell, mas quem sabe filtrar é a tela. Cada tela publica
 * aqui o que o menu dela mostra, como no web (`lib/navigation/section-menu.ts`): as
 * listas extras, a busca e a configuração. O estado fica na tela; o menu só chama
 * as funções que ela entrega. As listas Todos, Você e Agentes são do shell.
 */
data class SectionMenuModel(
    /** O número ao lado do nome da seção. */
    val count: Int? = null,
    val lists: List<SectionList> = emptyList(),
    val search: SectionSearch? = null,
    /** O que a engrenagem abre; sem nada, a engrenagem não aparece. */
    val settings: List<SectionSetting> = emptyList(),
    /** Há busca ou filtro ativo: a aba ganha o ponto. A escolha de executor não conta, como no web. */
    val filtered: Boolean = false,
    val onClear: (() -> Unit)? = null,
)

/** Uma linha de "Listas": um filtro pronto que a tela sabe aplicar. */
data class SectionList(
    val id: String,
    val name: String,
    /** Os parâmetros da lista, em mono (ex.: `#trabalho`). */
    val description: String? = null,
    val icon: List<SvgPart>,
    val count: Int? = null,
    val selected: Boolean,
    val onPick: () -> Unit,
)

data class SectionSearch(
    val label: String,
    val value: String,
    val onChange: (String) -> Unit,
)

data class SectionChoice(
    val label: String,
    val selected: Boolean,
    val onPick: () -> Unit,
)

/** Uma linha da configuração, aberta pela engrenagem. */
sealed interface SectionSetting {
    val label: String

    data class Segment(
        override val label: String,
        val options: List<SectionChoice>,
    ) : SectionSetting

    data class Toggles(
        override val label: String,
        val options: List<SectionChoice>,
    ) : SectionSetting

    data class Switch(
        override val label: String,
        val hint: String? = null,
        val on: Boolean,
        val onToggle: () -> Unit,
    ) : SectionSetting
}

/** O que cada seção publicou; o menu e o ponto da aba leem daqui. */
class SectionMenus {
    private val models = mutableStateMapOf<MainTab, SectionMenuModel>()

    operator fun get(tab: MainTab): SectionMenuModel? = models[tab]

    internal fun publish(
        tab: MainTab,
        model: SectionMenuModel,
    ) {
        models[tab] = model
    }

    internal fun withdraw(tab: MainTab) {
        models.remove(tab)
    }
}

val LocalSectionMenus = compositionLocalOf { SectionMenus() }

/** A tela publica o menu dela a cada composição e o retira ao sair. */
@Composable
fun PublishSectionMenu(
    tab: MainTab,
    model: SectionMenuModel,
) {
    val menus = LocalSectionMenus.current
    SideEffect { menus.publish(tab, model) }
    DisposableEffect(menus, tab) { onDispose { menus.withdraw(tab) } }
}
