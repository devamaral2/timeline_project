import type { TranscriptionResult } from "@repo/contracts";
import { describe, expect, test } from "vitest";
import { bylineOf, composeTranscriptionDocument, paragraphs, plain, timeLabel, type TranscriptionSummary } from "./transcription-document";

const VIDEO_ID = "dQw4w9WgXcQ";

function resultWith(overrides: Partial<TranscriptionResult> = {}): TranscriptionResult {
  return {
    video: { title: "Entrevista", channel: "Canal", durationSeconds: 900, description: "", chapters: [] },
    source: "whisper",
    segments: [
      { startSeconds: 0, endSeconds: 4, speaker: "Falante 1", text: "Bem-vindos." },
      { startSeconds: 4.5, endSeconds: 9, speaker: "Falante 2", text: "Obrigado." },
      { startSeconds: 125.5, endSeconds: 130, speaker: "Falante 1", text: "O ponto central." },
    ],
    hotMoments: [],
    comments: [],
    ...overrides,
  };
}

const NO_SUMMARY: TranscriptionSummary = { speakers: [], topics: [], hotMoments: [] };

const compose = (result: TranscriptionResult, summary: TranscriptionSummary = NO_SUMMARY, comments?: string) =>
  composeTranscriptionDocument(VIDEO_ID, result, result.segments, summary, comments);

describe("timeLabel", () => {
  test("MM:SS até uma hora e H:MM:SS depois, arredondando para baixo", () => {
    expect(timeLabel(0)).toBe("00:00");
    expect(timeLabel(125.9)).toBe("02:05");
    expect(timeLabel(3599)).toBe("59:59");
    expect(timeLabel(3600)).toBe("1:00:00");
    expect(timeLabel(7384)).toBe("2:03:04");
    expect(timeLabel(-5)).toBe("00:00");
  });
});

describe("saneamento do texto de fora", () => {
  test("plain deixa uma linha só, sem como virar link, negrito, título, âncora ou tag", () => {
    expect(plain("[clique](http://x) **forte**\n`código` {#t-1} <b>", 100)).toBe("clique(http://x) forte código #t-1 b");
    expect(plain("## Título\n- item", 100)).toBe("Título - item");
    expect(plain("> citação", 100)).toBe("citação");
  });

  test("plain corta no tamanho pedido sem deixar espaço sobrando", () => {
    expect(plain("abcdefghij", 5)).toBe("abcde");
    expect(plain("abcd efghij", 5)).toBe("abcd");
  });

  test("paragraphs separa as linhas, saneia cada uma e tira as vazias", () => {
    expect(paragraphs("Primeiro **parágrafo**.\n\n  \nSegundo [x].\r\nTerceiro")).toEqual(["Primeiro parágrafo.", "Segundo x.", "Terceiro"]);
  });

  test("bylineOf limita o canal a 60 caracteres de texto simples", () => {
    expect(bylineOf("Canal [do] *Zé*")).toBe("Canal do Zé");
    expect(bylineOf("x".repeat(100))).toHaveLength(60);
  });
});

describe("composeTranscriptionDocument", () => {
  test("só com as falas, o documento tem a seção da transcrição, com o tempo, o link do instante e o falante", () => {
    expect(compose(resultWith())).toBe(
      [
        "## Transcrição",
        "",
        `{#t-0} [00:00](https://youtu.be/${VIDEO_ID}?t=0) **Falante 1:** Bem-vindos.`,
        "",
        `{#t-4} [00:04](https://youtu.be/${VIDEO_ID}?t=4) **Falante 2:** Obrigado.`,
        "",
        `{#t-125} [02:05](https://youtu.be/${VIDEO_ID}?t=125) **Falante 1:** O ponto central.`,
      ].join("\n"),
    );
  });

  test("as seções saem na ordem da spec: resumo, mais assistidos, comentários, descrição e transcrição", () => {
    const result = resultWith({
      video: { title: "T", channel: "C", durationSeconds: 900, description: "Créditos", chapters: [] },
      hotMoments: [{ startSeconds: 120, endSeconds: 180, score: 0.9 }],
    });
    const summary: TranscriptionSummary = {
      speakers: [{ label: "Falante 1", name: "Ana" }],
      topics: [{ title: "Abertura", summary: "O começo.", startSegment: 0, minute: 0 }],
      hotMoments: [{ index: 0, subject: "A tese" }],
    };

    const document = compose(result, summary, "O público gostou.");

    const headings = document.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual(["## Resumo", "## Momentos mais assistidos", "## Comentários", "## Descrição", "## Transcrição"]);
    expect(document).toContain("- [Abertura](#t-0) (00:00): O começo.");
    expect(document).toContain("- [02:00–03:00](#t-125): A tese");
    expect(document).toContain("## Comentários\nO público gostou.");
    expect(document).toContain("**Ana:** Bem-vindos.");
    expect(document).toContain("**Falante 2:** Obrigado.");
  });

  test("um tópico com fala inexistente usa o minuto; sem lugar nenhum, some", () => {
    const summary: TranscriptionSummary = {
      speakers: [],
      topics: [
        { title: "Pelo minuto", summary: "", startSegment: 99, minute: 2 },
        { title: "Sem lugar", summary: "x", startSegment: -1, minute: 600 },
      ],
      hotMoments: [],
    };

    const document = compose(resultWith(), summary);

    expect(document).toContain("- [Pelo minuto](#t-125) (02:05)");
    expect(document).not.toContain("Sem lugar");
  });

  test("duas falas no mesmo segundo dividem a âncora da primeira", () => {
    const result = resultWith({
      segments: [
        { startSeconds: 10.1, endSeconds: 10.5, speaker: "Falante 1", text: "Um." },
        { startSeconds: 10.7, endSeconds: 11, speaker: "Falante 1", text: "Dois." },
      ],
    });

    const document = compose(result);

    expect(document.match(/\{#t-10\}/g)).toHaveLength(1);
    expect(document).toContain(`[00:10](https://youtu.be/${VIDEO_ID}?t=10) **Falante 1:** Dois.`);
  });

  test("a descrição e os nomes vindos de fora não viram markdown do documento", () => {
    const result = resultWith({
      video: { title: "T", channel: "C", durationSeconds: 900, description: "# Título falso\n{#t-0} âncora\n> citação\ntexto", chapters: [] },
    });
    const summary: TranscriptionSummary = { speakers: [{ label: "Falante 1", name: "[Ana](http://mau)" }], topics: [], hotMoments: [] };

    const document = compose(result, summary);

    expect(document).toContain("## Descrição\n\\# Título falso\n\\{#t-0} âncora\n\\> citação\ntexto");
    expect(document).toContain("**Ana(http://mau):**");
    expect(document).not.toContain("[Ana]");
  });

  test("o texto das falas entra como entregue, numa linha só", () => {
    const result = resultWith({ segments: [{ startSeconds: 0, endSeconds: 1, speaker: "Falante 1", text: "  Use [colchetes] *e*\n  asteriscos.  " }] });

    expect(compose(result)).toContain("**Falante 1:** Use [colchetes] *e* asteriscos.");
  });
});
