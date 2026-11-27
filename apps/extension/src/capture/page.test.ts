import { DAILY_READING_MARKDOWN_MAX, dailyReadingInputSchema } from "@repo/contracts/schemas";
import { expect, test } from "vitest";
import { toMarkdown } from "./markdown";
import { MARKDOWN_MAX, capturePage, fitMarkdown } from "./page";
import { youtubeLinkOf } from "./youtube";

const PAGE_URL = "https://jornal.example/economia/juros";
const paragraph = "O comitê cortou a taxa básica pela terceira vez seguida, em decisão unânime, e sinalizou novos cortes. ";

function documentOf(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function markdownOf(body: string): string {
  return toMarkdown(documentOf(`<body>${body}</body>`).body, PAGE_URL);
}

const article = `
  <html lang="pt-BR">
    <head>
      <base href="https://jornal.example/economia/juros" />
      <title>Juros caem pela terceira vez | Jornal Exemplo</title>
      <meta property="og:site_name" content="Jornal Exemplo" />
      <meta name="author" content="Ana Lima" />
    </head>
    <body>
      <nav><a href="/">Início</a> <a href="/assine">Assine</a></nav>
      <article>
        <h1>Juros caem pela terceira vez</h1>
        <p>${paragraph.repeat(4)}</p>
        <figure>
          <img src="/img/grafico.png" alt="Gráfico da taxa" />
          <figcaption>A taxa desde 2020.</figcaption>
        </figure>
        <h2>O que muda</h2>
        <p>${paragraph.repeat(3)} Leia a <a href="/ata">ata da reunião</a>.</p>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?start=30" title="Coletiva"></iframe>
        <p>${paragraph.repeat(3)}</p>
        <ul><li>Crédito mais barato</li><li>Poupança rende menos</li></ul>
      </article>
      <footer>Todos os direitos reservados.</footer>
      <script>window.rastreio = 1;</script>
    </body>
  </html>`;

test("uma reportagem vira o texto principal em markdown, sem menu nem rodapé, com o que a API pede", () => {
  const doc = documentOf(article);
  const before = doc.documentElement.outerHTML;

  const page = capturePage(doc, PAGE_URL);

  expect(page).toMatchObject({ kind: "article", url: PAGE_URL, siteName: "Jornal Exemplo", byline: "Ana Lima" });
  expect(page.title).toContain("Juros caem pela terceira vez");
  expect(page.markdown).toContain("O comitê cortou a taxa básica");
  expect(page.markdown).toContain("## O que muda");
  expect(page.markdown).toContain("![Gráfico da taxa](https://jornal.example/img/grafico.png)");
  expect(page.markdown).toContain("*A taxa desde 2020.*");
  expect(page.markdown).toContain("[ata da reunião](https://jornal.example/ata)");
  expect(page.markdown).toMatch(/\n\n\[Vídeo no YouTube\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&t=30\)\n\n/);
  expect(page.markdown).toContain("- Crédito mais barato\n- Poupança rende menos");
  expect(page.markdown).not.toContain("Assine");
  expect(page.markdown).not.toContain("direitos reservados");
  expect(page.markdown).not.toContain("rastreio");
  // A pagina que a pessoa ve nao muda: o leitor trabalha numa copia.
  expect(doc.documentElement.outerHTML).toBe(before);

  const { kind: _kind, ...body } = page;
  expect(dailyReadingInputSchema.safeParse(body).success).toBe(true);
});

test("uma página sem texto principal é guardada só como link, com a descrição dela", () => {
  const withDescription = capturePage(
    documentOf('<head><title>Painel</title><meta name="description" content="Seu painel de controle." /></head><body><button>Sair</button></body>'),
    "https://app.example/painel",
  );
  expect(withDescription).toEqual({ kind: "link", url: "https://app.example/painel", title: "Painel", markdown: "Seu painel de controle." });

  const bare = capturePage(documentOf("<body></body>"), "https://www.app.example/x");
  expect(bare).toMatchObject({ kind: "link", title: "app.example" });
  expect(bare.markdown.trim()).not.toBe("");
});

test("as imagens apontam para o original: endereço absoluto, a de carga tardia, a maior do srcset", () => {
  expect(markdownOf('<img src="foto.jpg" alt="Uma [foto]">')).toBe("![Uma \\[foto\\]](https://jornal.example/economia/foto.jpg)");
  expect(markdownOf('<img src="data:image/gif;base64,R0lGOD" data-src="//cdn.example/real (1).jpg" alt="">')).toBe(
    "![](https://cdn.example/real%20%281%29.jpg)",
  );
  expect(markdownOf('<img srcset="/p.jpg 480w, /g.jpg 1200w, /m.jpg 800w" alt="x">')).toBe("![x](https://jornal.example/g.jpg)");
  expect(markdownOf('<picture><source srcset="/a.webp 1x, /b.webp 2x"><img alt="y"></picture>')).toBe("![y](https://jornal.example/b.webp)");
});

test("pixel de rastreio, imagem embutida e imagem sem endereço ficam de fora", () => {
  expect(markdownOf('<p>texto<img src="https://track.example/p.gif" width="1" height="1"></p>')).toBe("texto");
  expect(markdownOf('<p>texto<img src="data:image/png;base64,AAAA" alt="logo"></p>')).toBe("texto");
  expect(markdownOf("<p>texto<img alt='nada'></p>")).toBe("texto");
});

test("uma imagem que só linka para ela mesma fica só a imagem; link relativo vira absoluto", () => {
  expect(markdownOf('<a href="/grande.jpg"><img src="/pequena.jpg" alt="z"></a>')).toBe("![z](https://jornal.example/pequena.jpg)");
  expect(markdownOf('<a href="../esportes">Esportes</a>')).toBe("[Esportes](https://jornal.example/esportes)");
  expect(markdownOf('<a href="javascript:alert(1)">clique</a>')).toBe("clique");
  expect(markdownOf('<a href="mailto:ana@jornal.example">Ana</a>')).toBe("[Ana](mailto:ana@jornal.example)");
});

test("vídeos e áudios entram como links: o do YouTube sozinho na linha, os outros com o nome do que são", () => {
  expect(markdownOf('<p>antes</p><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe><p>depois</p>')).toBe(
    "antes\n\n[Vídeo no YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\ndepois",
  );
  expect(markdownOf('<iframe src="https://player.vimeo.com/video/76979871?h=abc"></iframe>')).toBe("[Vídeo no Vimeo](https://vimeo.com/76979871)");
  expect(markdownOf('<iframe src="https://mapas.example/embed?q=1" title="Mapa da região"></iframe>')).toBe(
    "[Mapa da região](https://mapas.example/embed?q=1)",
  );
  expect(markdownOf('<video poster="/capa.jpg"><source src="/filme.mp4" type="video/mp4"></video>')).toBe("[Vídeo](https://jornal.example/filme.mp4)");
  expect(markdownOf('<audio src="https://cdn.example/podcast.mp3"></audio>')).toBe("[Áudio](https://cdn.example/podcast.mp3)");
  expect(markdownOf('<video src="blob:https://jornal.example/123"></video><p>resto</p>')).toBe("resto");
});

test("listas saem com um espaço depois do marcador, numeradas e aninhadas", () => {
  expect(markdownOf("<ol start='3'><li>três</li><li>quatro<ul><li>dentro</li></ul></li></ol>")).toBe("3. três\n4. quatro\n   - dentro");
  expect(markdownOf("<ul><li><p>um</p><p>segundo parágrafo</p></li><li>dois</li></ul>")).toBe("- um\n\n  segundo parágrafo\n- dois");
});

test("tabelas e riscado saem em GFM; script e formulário não entram", () => {
  const markdown = markdownOf(
    "<table><thead><tr><th>Ano</th><th>Taxa</th></tr></thead><tbody><tr><td>2025</td><td>10%</td></tr></tbody></table><p><del>velho</del></p><form><input value='x'><button>Enviar</button></form><script>alert(1)</script>",
  );
  expect(markdown).toContain("| Ano | Taxa |");
  expect(markdown).toContain("| 2025 | 10% |");
  expect(markdown).toMatch(/~+velho~+/);
  expect(markdown).not.toContain("Enviar");
  expect(markdown).not.toContain("alert");
});

test("um texto que passa do teto é cortado no fim de um parágrafo, com aviso, e ainda cabe na API", () => {
  expect(MARKDOWN_MAX).toBe(DAILY_READING_MARKDOWN_MAX);
  const long = Array.from({ length: 50 }, (_, index) => `Parágrafo ${index}. ${"a".repeat(90)}`).join("\n\n");

  const cut = fitMarkdown(long, 1000);

  expect(cut.length).toBeLessThanOrEqual(1000);
  expect(cut).toMatch(/a\n\n\*Texto cortado: [^*]+\*$/);
  expect(fitMarkdown("curto", 1000)).toBe("curto");
});

test("o endereço do YouTube sai canônico e guarda o início", () => {
  expect(youtubeLinkOf("https://youtu.be/dQw4w9WgXcQ?si=abc&t=1m30s")).toEqual({
    canonical: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    withStart: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s",
  });
  expect(youtubeLinkOf("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.canonical).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  expect(youtubeLinkOf("https://www.youtube.com/@canal")).toBeNull();
  expect(youtubeLinkOf("https://vimeo.com/123")).toBeNull();
});
