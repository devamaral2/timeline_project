package app.braid.mobile.domain.chat

import app.braid.mobile.domain.markdown.MarkdownInline
import java.util.Locale

/*
 * O que a resposta do agente ganha além do markdown (`lib/agent-chat/answer-format.ts`). O Hermes manda texto livre, sem
 * marcação combinada com o app, então tudo aqui é lido do próprio texto: as alternativas que ele pede para dizer, os termos
 * técnicos e o rótulo que abre um parágrafo. Conferido contra as fixtures geradas pelas funções do web (`AnswerFormatTest`).
 */

private val QUOTED = Regex("[\"“]([^\"“”\\n]{2,48})[\"”]")

// O `\s` do JS também casa espaços Unicode (como o U+00A0). Sem `(?U)`, que o regex do Android (ICU) recusa.
private const val SPACE = "[\\s\\p{Z}\\uFEFF]"
private val JOINER = Regex("$SPACE*(?:,|ou|or|,$SPACE*(?:ou|or))$SPACE*", RegexOption.IGNORE_CASE)
private const val MAX_CHOICES = 4
private const val MIN_CHOICES = 2

/**
 * As alternativas que o texto pede para o usuário dizer: trechos entre aspas ligados por "ou" ou vírgula, como em
 * `Diga "só gmail" ou "com calendar e drive"`. Uma citação sozinha não é escolha.
 */
fun answerChoices(text: String): List<String> {
    var run = mutableListOf<String>()
    var end = -1
    for (match in QUOTED.findAll(text)) {
        val value = match.groupValues[1].trim()
        val joined = end >= 0 && JOINER.matches(text.substring(end, match.range.first))
        if (!joined) {
            if (run.size >= MIN_CHOICES) break
            run = mutableListOf()
        }
        if (value.isNotEmpty() && value !in run) run += value
        end = match.range.last + 1
    }
    return if (run.size >= MIN_CHOICES) run.take(MAX_CHOICES) else emptyList()
}

private val PT_BR = Locale.forLanguageTag("pt-BR")

/** O rótulo do botão: a alternativa como o agente a escreveu, com a primeira letra maiúscula. */
fun choiceLabel(choice: String): String = if (choice.isEmpty()) choice else choice.substring(0, 1).uppercase(PT_BR) + choice.substring(1)

private const val SHORT_URL = 44
private val URL_PROTOCOL = Regex("^https?://(?:www\\.)?", RegexOption.IGNORE_CASE)
private val URL_TAIL = Regex("[?#].*$")

/** O endereço como se lê num texto: sem protocolo, e só até o primeiro trecho do caminho quando é longo. */
fun shortUrl(href: String): String {
    val bare = href.replace(URL_PROTOCOL, "").replace(URL_TAIL, "").removeSuffix("/")
    if (bare.length <= SHORT_URL) return bare
    val parts = bare.split("/")
    val first = parts.getOrNull(1)
    return if (first.isNullOrEmpty()) "${parts[0]}…" else "${parts[0]}/$first…"
}

/** Caminhos de arquivo (`/opt/data/token.json`) e constantes (`NOT_AUTHENTICATED`): viram código sem crase. */
private val TECHNICAL = Regex("(?<![\\w/.:])/(?:[\\w.-]+/)+[\\w.-]*\\w|\\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\\b")

/** Até quatro palavras e dois-pontos no começo do parágrafo: "Uma decisão antes: …". */
private val LEAD = Regex("^([^\\s:.!?][^:.!?\\n]{1,36}):(?=\\s+\\S)")
private const val LEAD_WORDS = 4
private const val LABEL_LENGTH = 40
private val WHITESPACE = Regex("\\s+")

private fun splitTechnical(value: String): List<MarkdownInline> {
    val parts = mutableListOf<MarkdownInline>()
    var last = 0
    for (match in TECHNICAL.findAll(value)) {
        if (match.range.first > last) parts += MarkdownInline.Text(value.substring(last, match.range.first))
        parts += MarkdownInline.Code(match.value)
        last = match.range.last + 1
    }
    if (parts.isEmpty()) return listOf(MarkdownInline.Text(value))
    if (last < value.length) parts += MarkdownInline.Text(value.substring(last))
    return parts
}

private fun withLead(children: List<MarkdownInline>): List<MarkdownInline> {
    val first = children.firstOrNull() as? MarkdownInline.Text ?: return children
    if (first.text.isEmpty()) return children
    val match = LEAD.find(first.text) ?: return children
    if (match.groupValues[1]
            .trim()
            .split(WHITESPACE)
            .size > LEAD_WORDS
    ) {
        return children
    }
    return listOf(
        MarkdownInline.Strong(listOf(MarkdownInline.Text(match.value))),
        MarkdownInline.Text(first.text.substring(match.value.length)),
    ) + children.drop(1)
}

private fun splitTechnicalIn(
    children: List<MarkdownInline>,
    inLink: Boolean,
): List<MarkdownInline> =
    children.flatMap { child ->
        when (child) {
            is MarkdownInline.Text -> if (inLink || child.text.isEmpty()) listOf(child) else splitTechnical(child.text)
            is MarkdownInline.Strong -> listOf(MarkdownInline.Strong(splitTechnicalIn(child.content, inLink)))
            is MarkdownInline.Emphasis -> listOf(MarkdownInline.Emphasis(splitTechnicalIn(child.content, inLink)))
            is MarkdownInline.Strike -> listOf(MarkdownInline.Strike(splitTechnicalIn(child.content, inLink)))
            is MarkdownInline.Link -> listOf(MarkdownInline.Link(child.href, splitTechnicalIn(child.content, true)))
            is MarkdownInline.Code, MarkdownInline.LineBreak -> listOf(child)
        }
    }

/** O texto corrido de um trecho, sem marcação. */
fun plainText(children: List<MarkdownInline>): String =
    children.joinToString("") {
        when (it) {
            is MarkdownInline.Text -> it.text
            is MarkdownInline.Code -> it.text
            is MarkdownInline.Strong -> plainText(it.content)
            is MarkdownInline.Emphasis -> plainText(it.content)
            is MarkdownInline.Strike -> plainText(it.content)
            is MarkdownInline.Link -> plainText(it.content)
            MarkdownInline.LineBreak -> "\n"
        }
    }

/** O parágrafo depois da leitura: um rótulo de lista, ou texto com as alternativas que ele pede para dizer. */
sealed interface PolishedParagraph {
    /** Um parágrafo curto que termina em dois-pontos e abre uma lista é o rótulo dela ("Os passos:"). */
    data class Label(
        val text: String,
    ) : PolishedParagraph

    data class Body(
        val children: List<MarkdownInline>,
        val choices: List<String>,
    ) : PolishedParagraph
}

/** O que `remarkAnswer` faz num parágrafo: [nextIsList] diz se o bloco seguinte é uma lista. */
fun polishParagraph(
    children: List<MarkdownInline>,
    nextIsList: Boolean,
): PolishedParagraph {
    val text = plainText(children).trim()
    if (nextIsList && text.length <= LABEL_LENGTH && text.endsWith(":") && !text.contains("\n")) {
        return PolishedParagraph.Label(text.dropLast(1))
    }
    return PolishedParagraph.Body(splitTechnicalIn(withLead(children), inLink = false), answerChoices(text))
}

/** Os termos técnicos de um trecho em linha viram código; é o que `remarkAnswer` faz em todo nó com filhos. */
fun polishInline(children: List<MarkdownInline>): List<MarkdownInline> = splitTechnicalIn(children, inLink = false)
