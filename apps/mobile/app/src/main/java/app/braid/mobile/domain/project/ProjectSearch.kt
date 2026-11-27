package app.braid.mobile.domain.project

import app.braid.mobile.domain.task.plainText

/**
 * Os projetos de [projects] (já na ordem da API: `personal` primeiro, os outros por nome) cujo nome tem o texto da
 * busca; sem texto, todos. A busca é no app, como no web: a API lista tudo.
 */
fun searchProjects(
    projects: List<Project>,
    query: String,
): List<Project> {
    val needle = plainText(query)
    return if (needle.isEmpty()) projects else projects.filter { plainText(it.name).contains(needle) }
}
