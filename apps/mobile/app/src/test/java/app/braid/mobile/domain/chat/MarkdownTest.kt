package app.braid.mobile.domain.chat

import org.junit.Assert.assertEquals
import org.junit.Test

/** O leitor de markdown das respostas: o que o web mostra com `react-markdown` e GFM, no que as respostas usam. */
class MarkdownTest {
    private fun text(value: String) = Inline.Text(value)

    @Test
    fun `plain paragraphs are split by blank lines and a soft break is a space`() {
        assertEquals(
            listOf(Block.Paragraph(listOf(text("um dois"))), Block.Paragraph(listOf(text("três")))),
            parseMarkdown("um\ndois\n\ntrês"),
        )
    }

    @Test
    fun `every heading level is the same heading`() {
        assertEquals(
            listOf(Block.Heading(listOf(text("A"))), Block.Heading(listOf(text("B"))), Block.Heading(listOf(text("C")))),
            parseMarkdown("# A\n## B\n###### C"),
        )
    }

    @Test
    fun `bold, italic, strike and code nest inside a line`() {
        assertEquals(
            listOf(
                Inline.Strong(listOf(text("forte "), Inline.Emphasis(listOf(text("e itálico"))))),
                text(" "),
                Inline.Strike(listOf(text("riscado"))),
                text(" "),
                Inline.Code("a_b"),
            ),
            parseInline("**forte *e itálico*** ~~riscado~~ `a_b`"),
        )
    }

    @Test
    fun `an underscore inside a word is text, not emphasis`() {
        assertEquals(listOf(text("snake_case_name")), parseInline("snake_case_name"))
    }

    @Test
    fun `links, bare addresses and images`() {
        assertEquals(
            listOf(
                Inline.Link("https://a.com/x", listOf(text("aqui"))),
                text(" e "),
                Inline.Link("https://b.com/y", listOf(text("https://b.com/y"))),
                text(". Foto: texto"),
            ),
            parseInline("[aqui](https://a.com/x) e https://b.com/y. Foto: ![texto](https://c.com/i.png)"),
        )
    }

    @Test
    fun `raw html is plain text`() {
        assertEquals(listOf(text("<b>oi</b>")), parseInline("<b>oi</b>"))
    }

    @Test
    fun `ordered and bullet lists, with a task and a nested list`() {
        val blocks = parseMarkdown("Passos:\n1. um\n2. dois\n   - filho\n\n- [x] feito\n- [ ] falta")
        assertEquals(3, blocks.size)
        val ordered = blocks[1] as Block.ListBlock
        assertEquals(true, ordered.ordered)
        assertEquals(1, ordered.start)
        assertEquals(2, ordered.items.size)
        val nested = ordered.items[1].blocks.last() as Block.ListBlock
        assertEquals(false, nested.ordered)
        val tasks = blocks[2] as Block.ListBlock
        assertEquals(listOf<Boolean?>(true, false), tasks.items.map { it.checked })
    }

    @Test
    fun `a fenced block keeps its lines and a table has a header and rows`() {
        val blocks = parseMarkdown("```\nls -la\ncd ..\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |")
        assertEquals(Block.CodeBlock("ls -la\ncd .."), blocks[0])
        val table = blocks[1] as Block.Table
        assertEquals(listOf(listOf(text("A")), listOf(text("B"))), table.header)
        assertEquals(listOf(listOf(listOf(text("1")), listOf(text("2")))), table.rows)
    }

    @Test
    fun `a quote holds blocks`() {
        assertEquals(listOf(Block.Quote(listOf(Block.Paragraph(listOf(text("citado")))))), parseMarkdown("> citado"))
    }
}
