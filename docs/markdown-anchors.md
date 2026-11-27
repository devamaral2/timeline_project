# Âncoras internas nos documentos de markdown

O leitor de markdown do web (`apps/web/src/components/notes/MarkdownView.tsx`) e o do
Android (`apps/mobile/.../ui/documents/MarkdownView.kt`) seguem a mesma convenção. Ela é a
do documento de transcrição de vídeo da spec #39, mas vale para qualquer documento de texto.

## Convenção

- **Id**: `t-<segundos>`, o instante em segundos inteiros desde o começo do vídeo (`t-0`, `t-125`).
  Só essa forma vira âncora.
- **Trecho**: um parágrafo que abre com `{#t-<segundos>}` é o trecho daquele instante. A marca é texto
  comum de markdown, não HTML (que nenhum leitor interpreta), então sobrevive ao saneamento. Ela não
  aparece na tela e o resto do parágrafo é renderizado normalmente (a minutagem como link para o vídeo,
  o nome de quem fala em negrito etc.).
- **Link**: `[tópico](#t-<segundos>)` rola até o trecho do mesmo documento. O link interno não é
  navegação de página: no web o clique é tratado dentro do leitor (rola até o trecho daquele documento
  e não muda o endereço), no Android a rolagem vai à tela do documento.
- **O que não é âncora**: outro `{#id}` (por exemplo `{#intro}`) segue como texto, para um documento
  não tomar ids da página. Link `#t-999` sem trecho correspondente não faz nada.
- Links externos (`http(s)`, `mailto:`) e o player do YouTube não mudam.

## Exemplo

```markdown
## Resumo
- [O ponto central](#t-125)

## Transcrição
{#t-0} [00:00](https://youtu.be/ID?t=0) **Ana:** Bem-vindos.

{#t-125} [02:05](https://youtu.be/ID?t=125) **Bia:** O ponto central é este.
```

## Onde está no código

- Web: `apps/web/src/lib/notes/anchors.ts` (convenção) e `MarkdownView.tsx` (id no parágrafo, clique).
- Android: `domain/markdown/Anchors.kt` (convenção, `scrollTargetOf`), `Markdown.kt`
  (`MarkdownBlock.Paragraph.anchor`) e `ui/documents/MarkdownView.kt` (rolagem com `bringIntoView`).
