package app.braid.mobile.core.designsystem

/*
 * Os ícones do web como dados: o `d` e as formas de cada SVG, copiados de
 * `components/ui/nav-icons.tsx`, `components/ui/type-icons.tsx`, `components/tasks/task-kind-mark.tsx` e do
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

    /** Artefatos: "Camadas", três camadas empilhadas (`ArtifactsNavIcon` do web). */
    val documentsNav =
        listOf(
            SvgPart("M12 3l9 4.5-9 4.5-9-4.5z"),
            SvgPart("M3 12l9 4.5 9-4.5"),
            SvgPart("M3 16.5l9 4.5 9-4.5"),
        )

    val chevronDown = listOf(SvgPart("m6 9 6 6 6-6"))
    val chevronLeft = listOf(SvgPart("m15 18-6-6 6-6"))
    val chevronRight = listOf(SvgPart("m9 18 6-6-6-6"))
    val chevronUp = listOf(SvgPart("m18 15-6-6-6 6"))

    val arrowLeft = listOf(SvgPart("m12 19-7-7 7-7"), SvgPart("M19 12H5"))
    val search = listOf(SvgPart(svgCircle(11f, 11f, 8f)), SvgPart("m21 21-4.3-4.3"))
    val arrowUp = listOf(SvgPart("m5 12 7-7 7 7"), SvgPart("M12 19V5"))

    /** O `X` do lucide: fecha, remove, e marca o pedido que falhou. */
    val close = listOf(SvgPart("M18 6 6 18"), SvgPart("m6 6 12 12"))
    val plus = listOf(SvgPart("M5 12h14"), SvgPart("M12 5v14"))
    val circle = listOf(SvgPart(svgCircle(12f, 12f, 10f)))

    /** O `Image` do lucide: a imagem do artefato que espera a pessoa pedir. */
    val image =
        listOf(
            SvgPart(svgRect(3f, 3f, 18f, 18f, 2f)),
            SvgPart(svgCircle(9f, 9f, 2f)),
            SvgPart("m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"),
        )

    /** O triângulo do play, cheio: o vídeo do YouTube que abre fora do app. */
    val play = listOf(SvgPart("M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z", fill = true))

    /** O `Loader` aberto do lucide: o pedido em andamento. */
    val spinner = listOf(SvgPart("M21 12a9 9 0 1 1-6.219-8.56"))

    /** O `MessageSquare` do lucide: o pedido, a mensagem. */
    val messageSquare = listOf(SvgPart("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"))

    /** O `Wrench` do lucide: a ferramenta, o pedido de construir. */
    val wrench =
        listOf(
            SvgPart(
                "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91" +
                    "a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
            ),
        )

    /** O `FileText` do lucide: o artefato de texto, o arquivo. */
    val fileText =
        listOf(
            SvgPart("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"),
            SvgPart("M14 2v4a2 2 0 0 0 2 2h4"),
            SvgPart("M10 9H8"),
            SvgPart("M16 13H8"),
            SvgPart("M16 17H8"),
        )

    /** O `CalendarDays` do lucide. */
    val calendarDays =
        listOf(
            SvgPart("M8 2v4"),
            SvgPart("M16 2v4"),
            SvgPart(svgRect(3f, 4f, 18f, 18f, 2f)),
            SvgPart("M3 10h18"),
            SvgPart("M8 14h.01"),
            SvgPart("M12 14h.01"),
            SvgPart("M16 14h.01"),
            SvgPart("M8 18h.01"),
            SvgPart("M12 18h.01"),
            SvgPart("M16 18h.01"),
        )

    /** O `Check` do lucide: marca a opção atual numa lista de escolha. */
    val check = listOf(SvgPart("M20 6 9 17l-5-5"))

    /** O `Hash` do lucide: marca a lista de uma tag no menu da seção. */
    val hash =
        listOf(
            SvgPart("M4 9h16"),
            SvgPart("M4 15h16"),
            SvgPart("M10 3 8 21"),
            SvgPart("M16 3l-2 18"),
        )

    /** O `ListChecks` do lucide: o ícone do estado vazio da lista de tarefas. */
    val listChecks =
        listOf(
            SvgPart("M13 5h8"),
            SvgPart("M13 12h8"),
            SvgPart("M13 19h8"),
            SvgPart("m3 17 2 2 4-4"),
            SvgPart("m3 7 2 2 4-4"),
        )

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
                // "Prato": garfo, prato e faca.
                listOf(
                    SvgPart("M2.5 4.5V8a1.5 1.5 0 0 0 3 0V4.5"),
                    SvgPart("M4 9.5v10"),
                    SvgPart(svgCircle(12f, 12f, 4f)),
                    SvgPart("M21 19.5v-15c-1.5 1-2.25 3.2-2.25 5.5v3H21"),
                )
            // "Lua e estrela".
            "sleep" ->
                listOf(
                    SvgPart("M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7.1 7.1 0 0 0 10 10z"),
                    SvgPart("M18.5 2.5v5"),
                    SvgPart("M16 5h5"),
                )
            // "Barra": o barbell.
            "training" ->
                listOf(
                    SvgPart("M6.5 6v12"),
                    SvgPart("M17.5 6v12"),
                    SvgPart("M3.5 9v6"),
                    SvgPart("M20.5 9v6"),
                    SvgPart("M6.5 12h11"),
                )
            "request" -> messageSquare
            "search_request" -> search
            "build_request" -> wrench
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
