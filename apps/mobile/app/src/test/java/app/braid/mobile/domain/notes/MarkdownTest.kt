package app.braid.mobile.domain.notes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MarkdownTest {
    private fun text(value: String) = MdInline.Text(value)

    @Test
    fun parsesHeadingsParagraphsAndRules() {
        assertEquals(
            listOf(
                MdBlock.Heading(1, listOf(text("Título"))),
                MdBlock.Heading(2, listOf(text("Seção"))),
                MdBlock.Paragraph(listOf(text("Uma\nduas linhas"))),
                MdBlock.Rule,
                MdBlock.Paragraph(listOf(text("Fim"))),
            ),
            parseMarkdown("# Título\n## Seção\n\nUma\nduas linhas\n\n---\nFim"),
        )
    }

    @Test
    fun parsesInlineEmphasisCodeAndEscapes() {
        assertEquals(
            listOf(
                MdInline.Bold(listOf(text("forte"))),
                text(" e "),
                MdInline.Italic(listOf(text("suave"))),
                text(" e "),
                MdInline.Strike(listOf(text("velho"))),
                text(" e "),
                MdInline.Code("código"),
                text(" e *literal*"),
            ),
            parseInlines("**forte** e *suave* e ~~velho~~ e `código` e \\*literal\\*"),
        )
    }

    @Test
    fun nestsEmphasisAndKeepsSnakeCaseIntact() {
        assertEquals(
            listOf(MdInline.Bold(listOf(text("a "), MdInline.Italic(listOf(text("b")))))),
            parseInlines("**a *b***"),
        )
        assertEquals(listOf(text("uma_variavel_longa")), parseInlines("uma_variavel_longa"))
        assertEquals(listOf(text("2 * 3 * 4")), parseInlines("2 * 3 * 4"))
        assertEquals(listOf(text("**aberto")), parseInlines("**aberto"))
    }

    @Test
    fun linksKeepOnlyWebAndMailAddresses() {
        assertEquals(
            listOf(MdInline.Link(listOf(text("site")), "https://exemplo.dev")),
            parseInlines("[site](https://exemplo.dev)"),
        )
        assertEquals(listOf(text("x")), parseInlines("[x](javascript:alert(1))"))
    }

    @Test
    fun parsesBulletTaskAndOrderedLists() {
        val blocks = parseMarkdown("- a\n  - aninhado\n- [x] feito\n- [ ] a fazer\n\n1. um\n2. dois\n   1. sub")
        val bullets = blocks[0] as MdBlock.ListBlock
        assertEquals(listOf(0, 1, 0, 0), bullets.items.map { it.depth })
        assertEquals(listOf(null, null, true, false), bullets.items.map { it.checked })
        val numbered = blocks[1] as MdBlock.ListBlock
        assertEquals(listOf(1, 2, 1), numbered.items.map { it.number })
        assertEquals(listOf(0, 0, 1), numbered.items.map { it.depth })
    }

    @Test
    fun parsesQuotesAndFences() {
        assertEquals(
            listOf(
                MdBlock.Quote(listOf(MdBlock.Paragraph(listOf(text("citação\nem duas"))))),
                MdBlock.CodeBlock("val a = 1\n\n- não é lista"),
            ),
            parseMarkdown("> citação\n> em duas\n\n```kotlin\nval a = 1\n\n- não é lista\n```"),
        )
    }

    @Test
    fun anUnclosedFenceTakesTheRestOfTheText() {
        assertEquals(listOf(MdBlock.CodeBlock("a\nb")), parseMarkdown("```\na\nb"))
    }

    @Test
    fun enterContinuesListsAndEndsEmptyItems() {
        assertEquals(TextEdit("- Arroz\n- ", 10), continueMarkdownList("- Arroz", 7))
        assertEquals("1. Um\n2. Dois\n3. ", continueMarkdownList("1. Um\n2. Dois", 13)?.value)
        assertEquals("- [x] Feito\n- [ ] ", continueMarkdownList("- [x] Feito", 11)?.value)
        assertEquals("> Citação\n> ", continueMarkdownList("> Citação", 9)?.value)
        assertEquals(TextEdit("- Arroz\n", 8), continueMarkdownList("- Arroz\n- ", 10))
        assertEquals("- Arroz\n-  integral", continueMarkdownList("- Arroz integral", 7)?.value)
    }

    @Test
    fun enterOutsideAListFollowsTheNormalPath() {
        assertNull(continueMarkdownList("Texto solto", 11))
        assertNull(continueMarkdownList("**negrito**", 11))
        assertNull(continueMarkdownList("- Arroz", 1))
    }
}
