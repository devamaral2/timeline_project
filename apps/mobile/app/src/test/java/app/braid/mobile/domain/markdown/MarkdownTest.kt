package app.braid.mobile.domain.markdown

import app.braid.mobile.domain.markdown.MarkdownBlock.Code
import app.braid.mobile.domain.markdown.MarkdownBlock.Heading
import app.braid.mobile.domain.markdown.MarkdownBlock.ListBlock
import app.braid.mobile.domain.markdown.MarkdownBlock.Paragraph
import app.braid.mobile.domain.markdown.MarkdownBlock.Quote
import app.braid.mobile.domain.markdown.MarkdownBlock.Rule
import app.braid.mobile.domain.markdown.MarkdownBlock.Table
import app.braid.mobile.domain.markdown.MarkdownInline.Emphasis
import app.braid.mobile.domain.markdown.MarkdownInline.Image
import app.braid.mobile.domain.markdown.MarkdownInline.LineBreak
import app.braid.mobile.domain.markdown.MarkdownInline.Link
import app.braid.mobile.domain.markdown.MarkdownInline.Strike
import app.braid.mobile.domain.markdown.MarkdownInline.Strong
import app.braid.mobile.domain.markdown.MarkdownInline.Text
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import app.braid.mobile.domain.markdown.MarkdownInline.Code as InlineCode

/** O markdown que os artefatos de texto mostram: títulos, listas, ênfase, código e links; HTML cru e imagem não. */
class MarkdownTest {
    private fun text(value: String) = Text(value)

    private fun paragraph(vararg content: MarkdownInline) = Paragraph(content.toList())

    private fun item(
        vararg content: MarkdownInline,
        checked: Boolean? = null,
    ) = MarkdownListItem(listOf(paragraph(*content)), checked)

    @Test
    fun `headings keep their level, and a hash with no space is plain text`() {
        assertEquals(
            listOf(Heading(1, listOf(text("Um"))), Heading(3, listOf(text("Três"))), paragraph(text("#Colado"))),
            parseMarkdown("# Um\n\n### Três ###\n\n#Colado"),
        )
    }

    @Test
    fun `lines of a paragraph join with a space, and two trailing spaces or a backslash break the line`() {
        assertEquals(listOf(paragraph(text("uma linha"))), parseMarkdown("uma\nlinha"))
        assertEquals(listOf(paragraph(text("uma"), LineBreak, text("linha"))), parseMarkdown("uma  \nlinha"))
        assertEquals(listOf(paragraph(text("uma"), LineBreak, text("linha"))), parseMarkdown("uma\\\nlinha"))
    }

    @Test
    fun `emphasis, strong, strike and inline code`() {
        assertEquals(
            listOf(
                paragraph(
                    Strong(listOf(text("forte"))),
                    text(" e "),
                    Emphasis(listOf(text("ênfase"))),
                    text(" e "),
                    Emphasis(listOf(text("outra"))),
                    text(" e "),
                    Strike(listOf(text("riscado"))),
                    text(" e "),
                    InlineCode("código"),
                ),
            ),
            parseMarkdown("**forte** e *ênfase* e _outra_ e ~~riscado~~ e `código`"),
        )
    }

    @Test
    fun `emphasis nests, and what does not close stays as text`() {
        assertEquals(
            listOf(paragraph(Emphasis(listOf(text("a "), Strong(listOf(text("b"))), text(" c"))))),
            parseMarkdown("*a **b** c*"),
        )
        assertEquals(listOf(paragraph(text("2 * 3 e snake_case_nome e **aberto"))), parseMarkdown("2 * 3 e snake_case_nome e **aberto"))
    }

    @Test
    fun `an escaped marker is text, and code is not parsed`() {
        assertEquals(listOf(paragraph(text("*não* é ênfase"))), parseMarkdown("\\*não\\* é ênfase"))
        assertEquals(listOf(paragraph(InlineCode("**a**"))), parseMarkdown("`**a**`"))
    }

    @Test
    fun `links keep their destination and their formatted text`() {
        assertEquals(
            listOf(paragraph(text("ver "), Link("https://example.com/a", listOf(text("o "), Strong(listOf(text("link"))))), text("."))),
            parseMarkdown("ver [o **link**](https://example.com/a)."),
        )
    }

    @Test
    fun `bare addresses and angle addresses become links, without the closing punctuation`() {
        assertEquals(
            listOf(
                paragraph(
                    text("abra "),
                    Link("https://example.com/b", listOf(text("https://example.com/b"))),
                    text(". Ou "),
                    Link("https://example.com/c", listOf(text("https://example.com/c"))),
                ),
            ),
            parseMarkdown("abra https://example.com/b. Ou <https://example.com/c>"),
        )
    }

    @Test
    fun `by default an image is not read, it becomes its alt text`() {
        assertEquals(listOf(paragraph(text("veja foto agora"))), parseMarkdown("veja ![foto](https://x.test/a.png) agora"))
    }

    @Test
    fun `with image reading on, a remote image keeps its address and alt text`() {
        assertEquals(
            listOf(paragraph(text("veja "), Image("https://x.test/a.png", "foto"), text(" agora"))),
            parseMarkdown("veja ![foto](https://x.test/a.png) agora", images = true),
        )
        assertEquals(
            listOf(paragraph(Image("https://x.test/a.png", ""))),
            parseMarkdown("![](https://x.test/a.png \"título\")", images = true),
        )
    }

    @Test
    fun `an image that is not on the network stays as its alt text even with image reading on`() {
        assertEquals(listOf(paragraph(text("local"))), parseMarkdown("![local](/c.png)", images = true))
        assertEquals(listOf(paragraph(text("data"))), parseMarkdown("![data](data:image/png;base64,AAAA)", images = true))
    }

    @Test
    fun `an image inside a list item or a table cell is read too`() {
        assertEquals(
            listOf(ListBlock(false, 1, listOf(item(Image("https://x.test/a.png", "a"))))),
            parseMarkdown("- ![a](https://x.test/a.png)", images = true),
        )
        assertEquals(
            Table(listOf(listOf(text("H"))), listOf(listOf(listOf(Image("https://x.test/a.png", "a"))))),
            parseMarkdown("| H |\n| - |\n| ![a](https://x.test/a.png) |", images = true).single(),
        )
    }

    @Test
    fun `pictures are split from the text around them, and only a linked picture keeps its link`() {
        val image = Image("https://x.test/a.png", "a")
        assertEquals(listOf(InlineRun.Text(listOf(text("só texto")))), splitPictures(listOf(text("só texto"))))
        assertEquals(
            listOf(InlineRun.Text(listOf(text("antes "))), InlineRun.Picture(image), InlineRun.Text(listOf(text(" depois")))),
            splitPictures(listOf(text("antes "), image, text(" depois"))),
        )
        assertEquals(listOf(InlineRun.Picture(image)), splitPictures(listOf(image, text(" "), LineBreak)))
        assertEquals(
            listOf(InlineRun.Picture(image, "https://x.test/destino")),
            splitPictures(listOf(Link("https://x.test/destino", listOf(image)))),
        )
        val strong = Strong(listOf(image))
        assertEquals(listOf(InlineRun.Text(listOf(strong))), splitPictures(listOf(strong)))
    }

    @Test
    fun `a paragraph that is only a youtube link is a video, with the caption the web gives`() {
        val bare = parseMarkdown("  https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90  ").single() as Paragraph
        assertEquals(
            VideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90", YouTubeVideo("dQw4w9WgXcQ", 90), null),
            soleYouTubeLink(bare),
        )
        assertEquals("Abrir no YouTube", soleYouTubeLink(bare)?.caption)

        val labelled = parseMarkdown("[Palestra](https://youtu.be/aqz-KE-bpKQ)").single() as Paragraph
        assertEquals("Palestra", soleYouTubeLink(labelled)?.caption)

        val labelIsAddress = parseMarkdown("[https://youtu.be/aqz-KE-bpKQ](https://youtu.be/aqz-KE-bpKQ)").single() as Paragraph
        assertEquals("Abrir no YouTube", soleYouTubeLink(labelIsAddress)?.caption)

        val www = parseMarkdown("www.youtube.com/watch?v=dQw4w9WgXcQ").single() as Paragraph
        assertEquals("Abrir no YouTube", soleYouTubeLink(www)?.caption)
    }

    @Test
    fun `a youtube link in a sentence, a non video address or another site stays a plain link`() {
        for (source in listOf(
            "Veja https://youtu.be/dQw4w9WgXcQ depois.",
            "https://vimeo.com/123456",
            "https://www.youtube.com/@canal",
            "https://youtu.be/dQw4w9WgXcQ e https://youtu.be/aqz-KE-bpKQ",
            "https://youtu.be/dQw4w9WgXcQ  \nhttps://youtu.be/aqz-KE-bpKQ",
        )) {
            assertNull(source, soleYouTubeLink(parseMarkdown(source).single() as Paragraph))
        }
    }

    @Test
    fun `raw html is shown as text, never interpreted`() {
        assertEquals(listOf(paragraph(text("<script>alert(1)</script>"))), parseMarkdown("<script>alert(1)</script>"))
    }

    @Test
    fun `bullet and numbered lists, with the start number`() {
        assertEquals(
            listOf(
                ListBlock(false, 1, listOf(item(text("Primeiro")), item(text("Segundo")))),
                ListBlock(true, 3, listOf(item(text("Três")), item(text("Quatro")))),
            ),
            parseMarkdown("- Primeiro\n- Segundo\n\n3. Três\n4. Quatro"),
        )
    }

    @Test
    fun `a list nests, and a line with more indentation belongs to the item`() {
        assertEquals(
            listOf(
                ListBlock(
                    false,
                    1,
                    listOf(
                        MarkdownListItem(listOf(paragraph(text("Pai")), ListBlock(false, 1, listOf(item(text("Filho")))))),
                        item(text("Irmão")),
                    ),
                ),
            ),
            parseMarkdown("- Pai\n  - Filho\n- Irmão"),
        )
    }

    @Test
    fun `task items are read only and keep whether they are done`() {
        assertEquals(
            listOf(ListBlock(false, 1, listOf(item(text("Feito"), checked = true), item(text("A fazer"), checked = false)))),
            parseMarkdown("- [x] Feito\n- [ ] A fazer"),
        )
    }

    @Test
    fun `a fenced block keeps its text as is, even without a closing fence`() {
        assertEquals(
            listOf(Code("const a = 1;\n\n  b"), paragraph(text("depois"))),
            parseMarkdown("```ts\nconst a = 1;\n\n  b\n```\ndepois"),
        )
        assertEquals(listOf(Code("sem fim\n# não é título")), parseMarkdown("~~~\nsem fim\n# não é título"))
    }

    @Test
    fun `quotes hold blocks, and a rule is a rule`() {
        assertEquals(
            listOf(Quote(listOf(paragraph(text("Citação")), ListBlock(false, 1, listOf(item(text("item")))))), Rule, Rule),
            parseMarkdown("> Citação\n>\n> - item\n\n---\n\n* * *"),
        )
    }

    @Test
    fun `a table has a header and rows of the same width`() {
        assertEquals(
            listOf(
                Table(
                    header = listOf(listOf(text("Nome")), listOf(text("Qtd"))),
                    rows =
                        listOf(
                            listOf(listOf(Strong(listOf(text("Arroz")))), listOf(text("2"))),
                            listOf(listOf(text("Sal")), emptyList()),
                        ),
                ),
            ),
            parseMarkdown("| Nome | Qtd |\n| --- | :-: |\n| **Arroz** | 2 |\n| Sal |"),
        )
    }

    @Test
    fun `a heading, a list or a fence ends a paragraph`() {
        assertEquals(
            listOf(paragraph(text("texto")), ListBlock(false, 1, listOf(item(text("a")))), Heading(2, listOf(text("T")))),
            parseMarkdown("texto\n- a\n## T"),
        )
    }

    @Test
    fun `an empty text has no blocks`() {
        assertEquals(emptyList<MarkdownBlock>(), parseMarkdown(""))
        assertEquals(emptyList<MarkdownBlock>(), parseMarkdown("\n  \n"))
    }

    // Os casos abaixo vieram do leitor das respostas do chat, que agora lê por este mesmo parser.

    @Test
    fun `strong and emphasis close together, with strike and code beside them`() {
        assertEquals(
            listOf(
                Strong(listOf(text("forte "), Emphasis(listOf(text("e itálico"))))),
                text(" "),
                Strike(listOf(text("riscado"))),
                text(" "),
                InlineCode("a_b"),
            ),
            parseInline("**forte *e itálico*** ~~riscado~~ `a_b`"),
        )
    }

    @Test
    fun `a bare address with www opens over https, and a closing parenthesis only belongs to the address when it opened one`() {
        assertEquals(
            listOf(text("veja "), Link("https://www.a.com/x", listOf(text("www.a.com/x"))), text(".")),
            parseInline("veja www.a.com/x."),
        )
        assertEquals(
            listOf(text("("), Link("https://a.com/x", listOf(text("https://a.com/x"))), text(")")),
            parseInline("(https://a.com/x)"),
        )
        assertEquals(
            listOf(Link("https://a.com/f_(x)", listOf(text("https://a.com/f_(x)")))),
            parseInline("https://a.com/f_(x)"),
        )
    }

    @Test
    fun `an ordered list keeps a nested bullet list and the lists beside it`() {
        val blocks = parseMarkdown("Passos:\n1. um\n2. dois\n   - filho\n\n- [x] feito\n- [ ] falta")
        assertEquals(3, blocks.size)
        val ordered = blocks[1] as ListBlock
        assertEquals(true, ordered.ordered)
        assertEquals(1, ordered.start)
        val nested = ordered.items[1].blocks.last() as ListBlock
        assertEquals(false, nested.ordered)
        assertEquals(listOf<Boolean?>(true, false), (blocks[2] as ListBlock).items.map { it.checked })
    }

    private val transcript =
        listOf(
            "## Resumo",
            "- [O ponto central](#t-125)\n- [Fonte](https://exemplo.dev/a)",
            "{#t-0} [00:00](https://youtu.be/dQw4w9WgXcQ?t=0) **Ana:** Bem-vindos.",
            "{#t-125} [02:05](https://youtu.be/dQw4w9WgXcQ?t=125) **Bia:** O ponto central é este.",
            "{#outro} fica como texto",
        ).joinToString("\n\n")

    @Test
    fun `a paragraph that opens with a time mark is that moment's anchor and the mark is not shown`() {
        val blocks = parseMarkdown(transcript)
        val anchored = blocks.filterIsInstance<Paragraph>().filter { it.anchor != null }

        assertEquals(listOf("t-0", "t-125"), anchored.map { it.anchor })
        assertEquals(
            Paragraph(
                listOf(
                    Link("https://youtu.be/dQw4w9WgXcQ?t=125", listOf(text("02:05"))),
                    text(" "),
                    Strong(listOf(text("Bia:"))),
                    text(" O ponto central é este."),
                ),
                anchor = "t-125",
            ),
            anchored[1],
        )
        // Só a forma t-<segundos> vira âncora; qualquer outro {#id} segue como texto.
        assertEquals(Paragraph(listOf(text("{#outro} fica como texto"))), blocks.last())
    }

    @Test
    fun `an internal link points at the anchor, and only an existing anchor can be scrolled to`() {
        val blocks = parseMarkdown(transcript)

        assertEquals("t-125", internalAnchorOf("#t-125"))
        assertNull(internalAnchorOf("#outro"))
        assertNull(internalAnchorOf("https://exemplo.dev/a#t-125"))
        assertNull(internalAnchorOf("/tarefas#t-125"))
        assertEquals("t-125", scrollTargetOf(blocks, "#t-125"))
        assertNull(scrollTargetOf(blocks, "#t-999"))
        assertNull(scrollTargetOf(blocks, "https://exemplo.dev/a"))
    }

    @Test
    fun `an anchor inside a list or a quote can still be scrolled to`() {
        val blocks = parseMarkdown("- {#t-7} sete\n\n> {#t-9} nove")

        assertEquals("t-7", scrollTargetOf(blocks, "#t-7"))
        assertEquals("t-9", scrollTargetOf(blocks, "#t-9"))
    }
}
