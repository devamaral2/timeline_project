package app.braid.mobile.domain.settings

import kotlinx.coroutines.flow.Flow

/** A escolha manual de tema: Névoa (claro) ou Noite (escuro). Sem escolha, o sistema decide. */
enum class ThemeChoice(
    val code: String,
) {
    Light("light"),
    Dark("dark"),
    ;

    companion object {
        /** O valor que o web guarda em `braid-theme`; ausente ou desconhecido deixa o sistema decidir. */
        fun fromCode(code: String?): ThemeChoice? = entries.firstOrNull { it.code == code }
    }
}

/** Se a tela fica escura: a escolha manda; sem escolha, vale o esquema do sistema. */
fun ThemeChoice?.isDark(systemDark: Boolean): Boolean =
    when (this) {
        ThemeChoice.Dark -> true
        ThemeChoice.Light -> false
        null -> systemDark
    }

interface ThemeRepository {
    /** A escolha guardada, ou `null` enquanto o sistema decide. */
    val choice: Flow<ThemeChoice?>

    suspend fun select(choice: ThemeChoice)
}
