package app.braid.mobile.ui.documents

import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.artifactVisualType

/** Os desenhos dos artefatos, os mesmos SVG do web (`type-icons.tsx`, `NoteSheet.tsx` e o lucide). */
object DocumentIcons {
    /** A letra A da nota de texto, a traço na grade de 24. */
    val letterA = listOf(SvgPart("m4.5 20 7.5-16 7.5 16"), SvgPart("M7.3 14h9.4"))

    /** "Jornal": as notícias. */
    val newspaper =
        listOf(
            SvgPart("M4 5.5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"),
            SvgPart("M17 9.5h2.5a1.5 1.5 0 0 1 1.5 1.5v7.5a2 2 0 0 1-2 2"),
            SvgPart("M7.5 9h6"),
            SvgPart("M7.5 12.5h6"),
            SvgPart("M7.5 16h3.5"),
        )

    /** "Carta": o resumo de e-mail. */
    val letter =
        listOf(
            SvgPart("M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"),
            SvgPart("M3.5 7.5l8.5 6 8.5-6"),
        )

    /** O ícone do YouTube do lucide: a transcrição. */
    val youtube =
        listOf(
            SvgPart(
                "M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 " +
                    "2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17",
            ),
            SvgPart("m10 15 5-3-5-3z"),
        )

    /** "Bússola": o roteador. */
    val compass =
        listOf(
            SvgPart(svgCircle(12f, 12f, 8.5f)),
            SvgPart("M15.75 8.25l-1.9 5.6-5.6 1.9 1.9-5.6z"),
        )

    /** "Movimento": o exercício, uma figura de braços erguidos. */
    val movement =
        listOf(
            SvgPart(svgCircle(12f, 4.5f, 2f)),
            SvgPart("M5.5 7.5l6.5 3 6.5-3"),
            SvgPart("M12 10.5V15"),
            SvgPart("M7.5 21l4.5-6 4.5 6"),
        )

    /**
     * O ícone do tipo na linha da lista: o do tipo de tarefa nas estruturadas, o do arquivo nas do Hermes, o próprio das
     * notícias, do resumo de e-mail e da transcrição, a letra no texto e no tipo desconhecido.
     */
    fun glyph(type: ArtifactType): List<SvgPart> =
        when (val visual = artifactVisualType(type)) {
            "meal", "training", "sleep" -> BraidIcons.taskKind(visual)
            "skill" -> BraidIcons.taskKind("build_request")
            "agent" -> BraidIcons.bot
            "router" -> compass
            "workout" -> movement
            "news" -> newspaper
            "email_summary" -> letter
            "youtube_transcript" -> youtube
            else -> letterA
        }

    /**
     * O ícone do artefato na lista "Produziu" do pedido (`noteTypeIcon` do web): o do tipo quando o contrato o diz; sem tipo,
     * na nota de texto e no tipo desconhecido, a folha de texto.
     */
    fun producedGlyph(type: ArtifactType?): List<SvgPart> =
        when (type) {
            null, ArtifactType.Text, ArtifactType.Unknown -> BraidIcons.fileText
            else -> glyph(type)
        }
}
