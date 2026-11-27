package app.braid.mobile.domain.project

import java.text.Normalizer
import java.util.Locale

private val Marks = Regex("\\p{M}")

/** Sem maiúsculas nem acentos: "Açaí" acha "acai". */
private fun plain(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFD).replace(Marks, "").lowercase(Locale("pt", "BR"))

/**
 * Os projetos de [projects] (já na ordem da API: `personal` primeiro, os outros por nome) cujo nome tem o texto da
 * busca; sem texto, todos. A busca é no app, como no web: a API lista tudo.
 */
fun searchProjects(
    projects: List<Project>,
    query: String,
): List<Project> {
    val needle = plain(query)
    return if (needle.isEmpty()) projects else projects.filter { plain(it.name).contains(needle) }
}
