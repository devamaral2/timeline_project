package app.braid.mobile.domain.markdown

/** Um trecho de um parágrafo para a tela: texto em linha, ou uma imagem que ocupa a própria linha. */
sealed interface InlineRun {
    data class Text(
        val nodes: List<MarkdownInline>,
    ) : InlineRun

    /** [href] é o destino quando a imagem está dentro de um link (`[![alt](img)](destino)`). */
    data class Picture(
        val image: MarkdownInline.Image,
        val href: String? = null,
    ) : InlineRun
}

/**
 * Separa as imagens do texto ao redor, como o web, onde a imagem é um bloco. Só a imagem solta ou a que é todo o
 * conteúdo de um link sai do texto; uma imagem dentro de negrito ou de um link com texto fica no lugar, com o texto
 * alternativo. Sem imagem, devolve um trecho só, com o conteúdo como veio.
 */
fun splitPictures(content: List<MarkdownInline>): List<InlineRun> {
    if (content.none { it is MarkdownInline.Image || (it is MarkdownInline.Link && it.content.singleOrNull() is MarkdownInline.Image) }) {
        return listOf(InlineRun.Text(content))
    }
    val runs = mutableListOf<InlineRun>()
    val pending = mutableListOf<MarkdownInline>()

    fun flush() {
        // O espaço e a quebra que sobram ao redor de uma imagem não são texto.
        val blank = pending.all { (it is MarkdownInline.Text && it.text.isBlank()) || it == MarkdownInline.LineBreak }
        if (pending.isNotEmpty() && !blank) runs += InlineRun.Text(pending.toList())
        pending.clear()
    }
    for (node in content) {
        val linked = (node as? MarkdownInline.Link)?.let { it.content.singleOrNull() as? MarkdownInline.Image }
        when {
            node is MarkdownInline.Image -> {
                flush()
                runs += InlineRun.Picture(node)
            }
            linked != null -> {
                flush()
                runs += InlineRun.Picture(linked, (node as MarkdownInline.Link).href)
            }
            else -> pending += node
        }
    }
    flush()
    return runs
}
