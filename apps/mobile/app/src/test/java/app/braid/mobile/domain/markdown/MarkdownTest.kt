package app.braid.mobile.domain.markdown

import app.braid.mobile.domain.markdown.MarkdownBlock.Code
import app.braid.mobile.domain.markdown.MarkdownBlock.Heading
import app.braid.mobile.domain.markdown.MarkdownBlock.ListBlock
import app.braid.mobile.domain.markdown.MarkdownBlock.Paragraph
import app.braid.mobile.domain.markdown.MarkdownBlock.Quote
import app.braid.mobile.domain.markdown.MarkdownBlock.Rule
import app.braid.mobile.domain.markdown.MarkdownBlock.Table
import app.braid.mobile.domain.markdown.MarkdownInline.Emphasis
import app.braid.mobile.domain.markdown.MarkdownInline.LineBreak
import app.braid.mobile.domain.markdown.MarkdownInline.Link
import app.braid.mobile.domain.markdown.MarkdownInline.Strike
import app.braid.mobile.domain.markdown.MarkdownInline.Strong
import app.braid.mobile.domain.markdown.MarkdownInline.Text
import org.junit.Assert.assertEquals
import org.junit.Test
import app.braid.mobile.domain.markdown.MarkdownInline.Code as InlineCode

/** O markdown que os documentos de texto mostram: títulos, listas, ênfase, código e links; HTML cru e imagem não. */
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
    fun `an image is not fetched, it becomes its alt text`() {
        assertEquals(listOf(paragraph(text("veja foto agora"))), parseMarkdown("veja ![foto](https://x.test/a.png) agora"))
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
}
