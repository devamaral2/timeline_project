package app.braid.mobile.domain.markdown

import java.net.URLDecoder

/** Um vídeo do YouTube lido de um endereço. [startSeconds] é de onde ele começa, quando o endereço diz. */
data class YouTubeVideo(
    val id: String,
    val startSeconds: Int? = null,
)

private val VIDEO_ID = Regex("^[A-Za-z0-9_-]{11}$")
private val HOSTS = setOf("youtube.com", "youtube-nocookie.com")

/** Os caminhos em que o id vem logo depois: `/embed/ID`, `/shorts/ID`, `/live/ID`, `/v/ID`. */
private val ID_PATHS = setOf("embed", "shorts", "live", "v")
private val SCHEME = Regex("^(?i)https?:[/\\\\]*")
private val SUBDOMAIN = Regex("^(www|m|music)\\.")
private val SECONDS = Regex("^[0-9]+s?$")
private val CLOCK = Regex("^(?:([0-9]+)h)?(?:([0-9]+)m)?(?:([0-9]+)s)?$")

/**
 * O vídeo de um endereço do YouTube (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`), ou `null` quando o
 * endereço não é de um vídeo: canal, playlist sem vídeo, busca ou outro site. Porta do `youtubeVideoOf` do web,
 * conferida contra fixtures geradas por ele. `\d` fica fora dos regex: o ICU do Android o abre para outros dígitos.
 */
fun youtubeVideoOf(href: String): YouTubeVideo? {
    val rest = SCHEME.find(href.trim())?.let { href.trim().substring(it.value.length) } ?: return null
    val authorityEnd = rest.indexOfFirst { it == '/' || it == '\\' || it == '?' || it == '#' }.let { if (it < 0) rest.length else it }
    val host =
        rest
            .substring(0, authorityEnd)
            .substringAfterLast('@')
            .replace(Regex(":[0-9]*$"), "")
            .lowercase()
            .replaceFirst(SUBDOMAIN, "")
    val tail = rest.substring(authorityEnd).substringBefore('#')
    val path =
        tail
            .substringBefore('?')
            .replace('\\', '/')
            .split('/')
            .filter { it.isNotEmpty() }
    val query = parseQuery(tail.substringAfter('?', ""))
    val first = path.getOrNull(0)
    val id: String? =
        when {
            host == "youtu.be" -> first
            host in HOSTS ->
                if (first == "watch") {
                    query["v"]
                } else if (first in ID_PATHS) {
                    path.getOrNull(1)
                } else {
                    null
                }
            else -> null
        }
    if (id == null || !VIDEO_ID.matches(id)) return null
    val start = parseStart(query["t"] ?: query["start"])
    return YouTubeVideo(id, start?.takeIf { it > 0 })
}

/** O primeiro valor de cada chave, como o `URLSearchParams` (`+` é espaço, `%XX` é decodificado). */
private fun parseQuery(query: String): Map<String, String> {
    val values = mutableMapOf<String, String>()
    for (pair in query.split('&')) {
        if (pair.isEmpty()) continue
        val key = decode(pair.substringBefore('='))
        if (key !in values) values[key] = decode(pair.substringAfter('=', ""))
    }
    return values
}

private fun decode(value: String): String =
    try {
        URLDecoder.decode(value, "UTF-8")
    } catch (malformed: IllegalArgumentException) {
        value
    }

/** `90`, `90s` ou `1h2m3s`. */
private fun parseStart(value: String?): Int? {
    if (value.isNullOrEmpty()) return null
    if (SECONDS.matches(value)) return value.trimEnd('s').toIntOrNull()
    val parts = CLOCK.matchEntire(value) ?: return null
    val (hours, minutes, seconds) = parts.destructured
    return (hours.toIntOrNull() ?: 0) * SECONDS_PER_HOUR + (minutes.toIntOrNull() ?: 0) * SECONDS_PER_MINUTE + (seconds.toIntOrNull() ?: 0)
}

private const val SECONDS_PER_HOUR = 3600
private const val SECONDS_PER_MINUTE = 60

/**
 * O parágrafo que é só um link para um vídeo do YouTube (um endereço solto ou `[rótulo](endereço)`; espaços ao redor
 * não contam). Um link no meio de uma frase continua link.
 */
data class VideoLink(
    val href: String,
    val video: YouTubeVideo,
    /** O texto do link quando ele diz algo além do endereço; `null` num link automático. */
    val title: String?,
) {
    /** A legenda sob o vídeo: o rótulo do link, ou "Abrir no YouTube" quando o texto é só o endereço. */
    val caption: String get() = title ?: OPEN_ON_YOUTUBE
}

const val OPEN_ON_YOUTUBE = "Abrir no YouTube"

/** O endereço do player oficial do YouTube (`youtube.com/embed`), o mesmo do `youtubeEmbedUrl` do web. */
fun youtubeEmbedUrl(video: YouTubeVideo): String {
    val start = video.startSeconds?.let { "?start=$it" } ?: ""
    return "https://www.youtube.com/embed/${video.id}$start"
}

fun soleYouTubeLink(paragraph: MarkdownBlock.Paragraph): VideoLink? {
    val children = paragraph.content.filterNot { it is MarkdownInline.Text && it.text.isBlank() }
    val link = children.singleOrNull() as? MarkdownInline.Link ?: return null
    val video = youtubeVideoOf(link.href) ?: return null
    val label = imageFreeText(link.content).trim()
    // Um link automático tem o próprio endereço como texto: repeti-lo como legenda seria ruído.
    val titled =
        label.isNotEmpty() && !label.startsWith("http://", true) && !label.startsWith("https://", true) && !label.startsWith("www.")
    return VideoLink(link.href, video, label.takeIf { titled })
}

/** O texto de um trecho como o web o lê do link: a imagem não tem texto próprio. */
private fun imageFreeText(content: List<MarkdownInline>): String =
    content.joinToString("") {
        when (it) {
            is MarkdownInline.Text -> it.text
            is MarkdownInline.Code -> it.text
            is MarkdownInline.Strong -> imageFreeText(it.content)
            is MarkdownInline.Emphasis -> imageFreeText(it.content)
            is MarkdownInline.Strike -> imageFreeText(it.content)
            is MarkdownInline.Link -> imageFreeText(it.content)
            is MarkdownInline.Image -> ""
            MarkdownInline.LineBreak -> ""
        }
    }

/**
 * O endereço de uma mensagem que é só um link de vídeo do YouTube (espaços ao redor não contam), ou `null` quando há
 * outro texto junto, mais de um link ou o endereço não é de um vídeo. Porta do `soleYouTubeVideoLink` do web: é o que
 * manda a mensagem do chat direto para o pedido de transcrição.
 */
fun soleYouTubeVideoLink(text: String): String? {
    val link = text.trim { it.isWhitespace() || it == '\uFEFF' || Character.isSpaceChar(it) }
    if (link.isEmpty() || link.any { it.isWhitespace() || it == '\uFEFF' || Character.isSpaceChar(it) }) return null
    return if (youtubeVideoOf(link) != null) link else null
}
