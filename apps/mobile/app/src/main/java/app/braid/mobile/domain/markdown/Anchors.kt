package app.braid.mobile.domain.markdown

/*
 * A convenção de âncora dos artefatos (a do artefato de transcrição de um vídeo, spec #39). Vale igual no web
 * (`apps/web/src/lib/notes/anchors.ts`).
 *
 * - O id é `t-<segundos>`: o instante, em segundos inteiros desde o começo.
 * - Um parágrafo que abre com `{#t-<segundos>}` é o trecho daquele instante. A marca é texto comum de markdown (HTML cru
 *   nunca é interpretado) e some da tela.
 * - Um link `[tópico](#t-<segundos>)` rola até o trecho, dentro do mesmo artefato.
 * - Só essa forma vira âncora: qualquer outro `{#id}` segue como texto.
 */

private val ANCHOR_ID = Regex("^t-\\d+$")
private val ANCHOR_MARK = Regex("^\\{#(t-\\d+)}[ \\t]*")

/** A âncora que abre o texto de um parágrafo e o texto sem a marca, ou `null`. */
internal fun splitAnchorMark(text: String): Pair<String, String>? =
    ANCHOR_MARK.find(text)?.let { it.groupValues[1] to text.substring(it.value.length) }

/** O id de uma âncora quando o link é interno (`#t-125`), ou `null`. */
fun internalAnchorOf(href: String): String? = href.removePrefix("#").takeIf { href.startsWith("#") && ANCHOR_ID.matches(it) }

/** O id para onde rolar ao tocar em [href], ou `null` quando o link não é interno ou o artefato não tem o trecho. */
fun scrollTargetOf(
    blocks: List<MarkdownBlock>,
    href: String,
): String? = internalAnchorOf(href)?.takeIf { it in anchorsOf(blocks) }

private fun anchorsOf(blocks: List<MarkdownBlock>): Set<String> =
    blocks
        .flatMap { block ->
            when (block) {
                is MarkdownBlock.Paragraph -> listOfNotNull(block.anchor)
                is MarkdownBlock.ListBlock -> block.items.flatMap { anchorsOf(it.blocks) }
                is MarkdownBlock.Quote -> anchorsOf(block.blocks).toList()
                else -> emptyList()
            }
        }.toSet()
