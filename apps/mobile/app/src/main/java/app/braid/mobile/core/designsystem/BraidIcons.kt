package app.braid.mobile.core.designsystem

/*
 * Os ícones do web como dados: o `d` e as formas de cada SVG, copiados de
 * `components/ui/nav-icons.tsx`, `components/tasks/task-kind-mark.tsx` e do
 * lucide-react (o robô e as setas). Na grade de 24.
 */
object BraidIcons {
    /** Tarefas: a caixa aberta num canto, com o check saindo por ele. */
    val tasksNav =
        listOf(
            SvgPart("M20.5 12v6.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H15"),
            SvgPart("M8 11l3.5 3.5L21.5 4"),
        )

    /** Agenda: o calendário com um só dia marcado, à esquerda. */
    val agendaNav =
        listOf(
            SvgPart("M8 2v4M16 2v4M3 10h18"),
            SvgPart(svgRect(3f, 4f, 18f, 18f, 2f)),
            SvgPart(svgRect(6.25f, 13.25f, 4.75f, 4.75f, 1.3f), fill = true),
        )

    /** Documentos: duas páginas empilhadas, a da frente com as linhas do texto. */
    val documentsNav =
        listOf(
            SvgPart(svgRect(3.5f, 6.5f, 13f, 15f, 2f)),
            SvgPart("M7 11.5h6M7 15.5h4"),
            SvgPart("M8 2.75h10.5a2 2 0 0 1 2 2V18"),
        )

    val chevronDown = listOf(SvgPart("m6 9 6 6 6-6"))
    val chevronLeft = listOf(SvgPart("m15 18-6-6 6-6"))
    val chevronRight = listOf(SvgPart("m9 18 6-6-6-6"))

    /** O `Check` do lucide: marca a opção atual numa lista de escolha. */
    val check = listOf(SvgPart("M20 6 9 17l-5-5"))

    /** O robô de linha que assina a tarefa de agente (lucide `Bot`). */
    val bot =
        listOf(
            SvgPart("M12 8V4H8"),
            SvgPart(svgRect(4f, 8f, 16f, 12f, 2f)),
            SvgPart("M2 14h2"),
            SvgPart("M20 14h2"),
            SvgPart("M15 13v2"),
            SvgPart("M9 13v2"),
        )

    /** O desenho de cada tipo de tarefa, o do quadro Tipos do canvas (traço 2). */
    fun taskKind(code: String): List<SvgPart> =
        when (code) {
            "common" ->
                listOf(
                    SvgPart("M8 2v4"),
                    SvgPart("M16 2v4"),
                    SvgPart(svgRect(3f, 4f, 18f, 18f, 2f)),
                    SvgPart("M3 10h18"),
                    SvgPart("m9 16 2 2 4-4"),
                )
            "meal" ->
                listOf(
                    SvgPart("M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"),
                    SvgPart("M7 2v20"),
                    SvgPart("M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"),
                )
            "sleep" -> listOf(SvgPart("M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"))
            "training" ->
                listOf(
                    SvgPart("M6.5 6.5v11"),
                    SvgPart("M17.5 6.5v11"),
                    SvgPart("M3.5 9v6"),
                    SvgPart("M20.5 9v6"),
                    SvgPart("M6.5 12h11"),
                )
            "request" -> listOf(SvgPart("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"))
            "search_request" -> listOf(SvgPart(svgCircle(11f, 11f, 8f)), SvgPart("m21 21-4.3-4.3"))
            "build_request" ->
                listOf(
                    SvgPart(
                        "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91" +
                            "a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
                    ),
                )
            "inquiry_request" ->
                listOf(
                    SvgPart(svgCircle(12f, 12f, 10f)),
                    SvgPart("M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"),
                    SvgPart("M12 17h.01"),
                )
            "review_request" ->
                listOf(
                    SvgPart("M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"),
                    SvgPart(svgCircle(12f, 12f, 3f)),
                )
            "cron" ->
                listOf(
                    SvgPart(svgLine(10f, 2f, 14f, 2f)),
                    SvgPart(svgLine(12f, 14f, 15f, 11f)),
                    SvgPart(svgCircle(12f, 14f, 8f)),
                )
            "step" -> listOf(SvgPart("m15 10 5 5-5 5"), SvgPart("M4 4v7a4 4 0 0 0 4 4h12"))
            else -> error("Tipo sem ícone: $code")
        }
}
