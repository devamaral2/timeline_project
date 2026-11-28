import { describe, expect, it } from "vitest";
import { dueToneOf, initialsOf, plainInline, secondsOf, summaryCardsFor, summaryCardsOf, summaryCardsTypeOf } from "./summary-cards";
import { EMAIL_SUMMARY_SAMPLE, NEWS_SAMPLE, YOUTUBE_TRANSCRIPT_SAMPLE } from "./summary-cards.samples";

describe("summaryCardsOf", () => {
  it("não monta ficha de um texto sem título", () => {
    expect(summaryCardsOf("news", "Só um parágrafo.\n\n- e uma lista")).toBeNull();
    expect(summaryCardsOf("email_summary", "")).toBeNull();
    expect(summaryCardsOf("news", "```\n## dentro de código\n```")).toBeNull();
  });

  it("lê o resumo de e-mail: grupos, remetente, prazo, ações e as listas", () => {
    const document = summaryCardsOf("email_summary", EMAIL_SUMMARY_SAMPLE);
    expect(document?.lead).toBe("Três e-mails pedem resposta, e o da contadora vence hoje.");
    expect(document?.score).toEqual([
      { value: 14, label: "e-mails" },
      { value: 3, label: "pedem resposta" },
      { value: 1, label: "vence hoje" },
    ]);
    expect(document?.sections.map((section) => [section.kind, section.title])).toEqual([
      ["cards", "Pedem resposta"],
      ["rows", "Para saber"],
      ["rows", "Sem ação"],
    ]);
    const [reply, know] = document?.sections ?? [];
    if (reply?.kind !== "cards" || know?.kind !== "rows") throw new Error("grupos fora do esperado");
    expect(reply.cards[0]).toEqual({
      title: "Documentos do imposto",
      kicker: null,
      from: { name: "Marina Costa", detail: "09:12", initials: "MC" },
      due: { text: "hoje, 18h", tone: "soon" },
      sources: [],
      actions: [{ label: "Responder", href: "https://mail.example.com/t/1" }],
      body: "Faltam o informe do banco e o recibo do aluguel para fechar a declaração.",
    });
    expect(reply.cards[1]?.from).toEqual({ name: "Otávio Lima", detail: "ontem", initials: "OL" });
    expect(reply.cards[1]?.due).toEqual({ text: "sexta, 29 nov", tone: "calm" });
    expect(reply.cards[1]?.actions.map((action) => action.label)).toEqual(["Responder", "Abrir o anexo"]);
    expect(reply.cards[2]).toMatchObject({ from: { name: "Escola Aurora", detail: null, initials: "EA" }, due: null, actions: [] });
    expect(know.rows).toEqual([
      { title: "Banco Prisma", text: "a fatura de novembro fechou em R$ 1.240.", time: null, href: null, range: null },
      { title: "Condomínio", text: "a assembleia ficou para o dia 5.", time: null, href: null, range: null },
      { title: "Entrega a caminho", text: "chega na segunda.", time: null, href: "https://loja.example.com/pedido/9", range: null },
      { title: null, text: "A academia fecha no feriado.", time: null, href: null, range: null },
    ]);
    expect(know.peaks).toBe(false);
  });

  it("lê as notícias: a editoria vai para dentro da ficha e as fontes viram etiquetas", () => {
    const document = summaryCardsOf("news", NEWS_SAMPLE);
    expect(document?.score).toEqual([
      { value: 3, label: "assuntos" },
      { value: 5, label: "fontes" },
      { value: 1, label: "min de leitura" },
    ]);
    expect(document?.sections).toHaveLength(1);
    const [stories] = document?.sections ?? [];
    if (stories?.kind !== "cards") throw new Error("grupo fora do esperado");
    expect(stories.title).toBeNull();
    expect(stories.cards.map((card) => [card.kicker, card.title])).toEqual([
      ["Economia", "Conta de luz fica mais barata em dezembro"],
      ["Cidade", "Ônibus noturno volta a circular no dia 1º"],
      ["Tecnologia", "Navegadores vão avisar quando uma extensão lê a página"],
    ]);
    expect(stories.cards[0]?.sources).toEqual([
      { label: "Folha do Vale", href: "https://folhadovale.example.com/luz" },
      { label: "Portal Lume", href: "https://lume.example.com/bandeira" },
    ]);
    expect(stories.cards[2]?.sources).toEqual([
      { label: "Revista Trama", href: null },
      { label: "Portal Lume", href: null },
      { label: "Boletim Bit", href: null },
    ]);
    expect(stories.cards[2]?.body).toContain("> As antigas terão 90 dias para se adaptar.");
    expect(stories.cards[2]?.body).not.toContain("Fontes:");
  });

  it("faz uma ficha de cada título quando a notícia vem sem editoria", () => {
    const document = summaryCardsOf("news", "## Primeira\nTexto um.\n\n## Segunda\nTexto dois.\n\nFonte: [Jornal](https://jornal.example.com)");
    expect(document?.sections).toEqual([
      {
        kind: "cards",
        title: null,
        intro: "",
        cards: [
          { title: "Primeira", kicker: null, from: null, due: null, sources: [], actions: [], body: "Texto um." },
          { title: "Segunda", kicker: null, from: null, due: null, sources: [{ label: "Jornal", href: "https://jornal.example.com" }], actions: [], body: "Texto dois." },
        ],
      },
    ]);
  });

  it("lê a transcrição: a fonte, as partes, os mais assistidos, o texto e as falas", () => {
    const document = summaryCardsOf("youtube_transcript", YOUTUBE_TRANSCRIPT_SAMPLE);
    expect(document?.source).toEqual({ label: "YouTube", href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", byline: "Corpo em Pauta" });
    expect(document?.lead).toBe("Para a fisiologista Paula Reis, dormir sempre no mesmo horário pesa mais no treino do que dormir muito.");
    expect(document?.durationSeconds).toBe(2870);
    expect(document?.score).toEqual([
      { value: 48, label: "minutos" },
      { value: 2, label: "pessoas" },
      { value: 3, label: "partes" },
    ]);
    expect(document?.sections.map((section) => [section.kind, section.title])).toEqual([
      ["rows", "Resumo"],
      ["rows", "Momentos mais assistidos"],
      ["text", "Comentários"],
      ["transcript", "Transcrição"],
    ]);
    const [parts, peaks, comments, transcript] = document?.sections ?? [];
    if (parts?.kind !== "rows" || peaks?.kind !== "rows" || comments?.kind !== "text" || transcript?.kind !== "transcript") throw new Error("grupos fora do esperado");
    expect(parts.peaks).toBe(false);
    expect(parts.rows).toEqual([
      { title: "Abertura", text: "Helena apresenta a convidada.", time: "00:00", href: "#t-0", range: null },
      { title: "O sono pesa mais que o treino", text: "o músculo se refaz dormindo.", time: "03:10", href: "#t-190", range: null },
      { title: "Horário fixo antes da duração", text: "", time: "11:45", href: "#t-705", range: null },
    ]);
    expect(peaks.peaks).toBe(true);
    expect(peaks.rows[0]).toEqual({
      title: null,
      text: "o corpo confere se você apareceu na hora de sempre.",
      time: "12:40–13:05",
      href: "#t-705",
      range: { start: 760, end: 785 },
    });
    expect(comments.body).toBe("Quem comentou pede um episódio só sobre cochilo.\n\nMuita gente discorda do corte de cafeína.");
    expect(transcript.body.startsWith("{#t-0} [00:00]")).toBe(true);
  });

  it("trata um título sozinho no topo como o nome do texto", () => {
    const document = summaryCardsOf("email_summary", "# Caixa de entrada\n\nAbertura.\n\n## Urgentes\n- **Ana:** responder.\n");
    expect(document?.lead).toBe("Abertura.");
    expect(document?.sections).toEqual([
      { kind: "rows", title: "Urgentes", rows: [{ title: "Ana", text: "responder.", time: null, href: null, range: null }], peaks: false },
    ]);
    expect(document?.score).toEqual([]);
  });

  it("não aceita endereço que não seja http(s) em fonte, ação nem linha", () => {
    const document = summaryCardsOf("news", "## Título\nTexto.\n\nFonte: [Jornal](javascript:alert(1))\n\n[Abrir](javascript:alert(1))\n\n## Lista\n- [Item](javascript:x): texto\n");
    const [story, list] = document?.sections ?? [];
    if (story?.kind !== "cards" || list?.kind !== "rows") throw new Error("grupos fora do esperado");
    expect(story.cards[0]?.actions).toEqual([]);
    expect(story.cards[0]?.sources.every((link) => link.href === null)).toBe(true);
    expect(list.rows[0]?.href).toBeNull();
  });
});

describe("summaryCardsTypeOf", () => {
  it("lê os três tipos de resumo como o que são", () => {
    expect(summaryCardsTypeOf("news", "qualquer texto")).toBe("news");
    expect(summaryCardsTypeOf("email_summary", "")).toBe("email_summary");
    expect(summaryCardsTypeOf("youtube_transcript", "")).toBe("youtube_transcript");
  });

  it("lê como transcrição a nota que a Leitura diária guarda de um vídeo", () => {
    expect(summaryCardsTypeOf("text", YOUTUBE_TRANSCRIPT_SAMPLE)).toBe("youtube_transcript");
    expect(summaryCardsFor("text", YOUTUBE_TRANSCRIPT_SAMPLE)).toEqual(summaryCardsOf("youtube_transcript", YOUTUBE_TRANSCRIPT_SAMPLE));
    // A fonte vem depois de linhas em branco e o endereço pode ser o curto.
    expect(summaryCardsTypeOf("text", "\n\nFonte: [YouTube](https://youtu.be/dQw4w9WgXcQ)\n\n## Transcrição\n{#t-0} Oi.")).toBe("youtube_transcript");
  });

  it("deixa em markdown a nota comum, a página lida e o vídeo ainda sem transcrição", () => {
    expect(summaryCardsTypeOf("text", "## Compras\n- pão")).toBeNull();
    expect(summaryCardsTypeOf("text", "Fonte: [Jornal](https://jornal.example.com/a)\n\n## Título\n{#t-0} Texto.")).toBeNull();
    expect(summaryCardsTypeOf("text", "Fonte: [YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\nTranscrição em andamento.")).toBeNull();
    expect(summaryCardsTypeOf("text", "Texto antes.\n\nFonte: [YouTube](https://youtu.be/dQw4w9WgXcQ)\n\n{#t-0} Oi.")).toBeNull();
    expect(summaryCardsFor("text", "## Compras\n- pão")).toBeNull();
  });

  it("não lê em fichas os outros tipos, mesmo com o texto de uma transcrição", () => {
    expect(summaryCardsTypeOf("router", YOUTUBE_TRANSCRIPT_SAMPLE)).toBeNull();
    expect(summaryCardsTypeOf("food", YOUTUBE_TRANSCRIPT_SAMPLE)).toBeNull();
  });
});

describe("as regras miúdas", () => {
  it("tira a marcação de um trecho de uma linha", () => {
    expect(plainInline("**Negrito** e [link](https://a.example.com) com `código`")).toBe("Negrito e link com código");
    expect(plainInline("  dois   espaços \\_ ")).toBe("dois espaços _");
  });

  it("faz as iniciais com a primeira e a última palavra", () => {
    expect(initialsOf("Marina Costa")).toBe("MC");
    expect(initialsOf("ana maria de souza")).toBe("AS");
    expect(initialsOf("RH")).toBe("R");
    expect(initialsOf("—")).toBe("");
  });

  it("dá o tom do prazo pelo texto", () => {
    expect(dueToneOf("hoje, 18h")).toBe("soon");
    expect(dueToneOf("Atrasado desde terça")).toBe("late");
    expect(dueToneOf("venceu ontem")).toBe("late");
    expect(dueToneOf("sexta")).toBe("calm");
  });

  it("converte a minutagem em segundos", () => {
    expect(secondsOf("12:40")).toBe(760);
    expect(secondsOf("1:02:03")).toBe(3723);
  });
});
