package app.braid.mobile.domain.project

/** O projeto de uma tarefa (`projectSchema`): [personal] é o padrão de quem não escolheu nenhum, e o único de marca neutra. */
data class Project(
    val id: String,
    val name: String,
    val personal: Boolean,
) {
    companion object {
        /** O que o formulário mostra enquanto ninguém escolheu: a tarefa nasce em `diario`. A marca só depende do nome. */
        val Personal = Project(id = "", name = "diario", personal = true)
    }
}
