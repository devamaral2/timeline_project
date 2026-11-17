package app.braid.mobile.domain.task

import java.text.Normalizer
import java.util.Locale

private val COMBINING_MARKS = Regex("[\\u0300-\\u036f]")
private val PORTUGUESE_BRAZIL = Locale.forLanguageTag("pt-BR")

/** Minúsculas e sem acento, para a busca do menu achar "cafe" em "Café" (a `plain` do web). */
fun plainText(text: String): String =
    Normalizer.normalize(text.lowercase(PORTUGUESE_BRAZIL), Normalizer.Form.NFD).replace(COMBINING_MARKS, "")

/** Busca vazia, ou só com espaços, deixa tudo passar. */
fun nameMatchesSearch(
    name: String,
    search: String,
): Boolean {
    val needle = plainText(search.trim())
    return needle.isEmpty() || plainText(name).contains(needle)
}

/** As tarefas cujo nome tem o texto buscado; a busca olha só o nome. */
fun List<TaskCard>.matchingSearch(search: String): List<TaskCard> = filter { nameMatchesSearch(it.name, search) }
