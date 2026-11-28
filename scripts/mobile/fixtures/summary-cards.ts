/**
 * Fixtures das fichas de notícias, de resumo de e-mail e de transcrição (`docs/summary-cards.md`): as saídas de
 * `summaryCardsOf` do web para os mesmos textos que o app Android lê. O `null` do web (texto sem título) é o `result`
 * nulo da fixture. A porta Kotlin (`domain/markdown/SummaryCards.kt`) é conferida contra ela, campo a campo, e também
 * contra `summaryCardsTypeOf`, que diz de que jeito cada artefato é lido.
 */
import { summaryCardsOf, summaryCardsTypeOf, type SummaryCardsType } from "../../../apps/web/src/lib/notes/summary-cards";
import { EMAIL_SUMMARY_SAMPLE, NEWS_SAMPLE, YOUTUBE_TRANSCRIPT_SAMPLE } from "../../../apps/web/src/lib/notes/summary-cards.samples";

const CASES: [SummaryCardsType, string][] = [
  ["email_summary", EMAIL_SUMMARY_SAMPLE],
  ["news", NEWS_SAMPLE],
  ["youtube_transcript", YOUTUBE_TRANSCRIPT_SAMPLE],
  // Os mesmos textos lidos como outro tipo: muda o que é ficha, o que é texto e os números do topo.
  ["news", EMAIL_SUMMARY_SAMPLE],
  ["youtube_transcript", NEWS_SAMPLE],
  ["email_summary", YOUTUBE_TRANSCRIPT_SAMPLE],
  // Sem título nenhum não há ficha.
  ["news", "Só um parágrafo.\n\n- e uma lista"],
  ["email_summary", ""],
  ["youtube_transcript", "   \n\n"],
  ["news", "```\n## dentro de código\n```"],
  // Título sozinho no topo, quebras de linha do Windows e título fechado com cerquilhas.
  ["email_summary", "# Caixa de entrada\r\n\r\nAbertura.\r\n\r\n## Urgentes ##\r\n- **Ana:** responder.\r\n"],
  ["email_summary", "# Só um título\n\nE um texto."],
  // Notícia sem editoria: uma ficha por título, juntas no mesmo grupo.
  ["news", "## Primeira\nTexto um.\n\n## Segunda\nTexto dois.\n\nFonte: [Jornal](https://jornal.example.com)"],
  // Campos em negrito, em item de lista e repetidos; ações em várias linhas; código que não é campo.
  [
    "email_summary",
    "## Grupo\n\n### Ficha\n**De:** Ana Maria de Souza · 10:30\n- Prazo: atrasado desde terça\nDe: Outra pessoa\n**Fontes**: A; B | C\nTexto.\n\n```\nPrazo: dentro de código\n```\n\n[Responder](mailto:ana@example.com)\n[Abrir](https://a.example.com) | [Ignorado](ftp://a.example.com)\n\n[Um link](https://b.example.com) no meio de uma frase.\n",
  ],
  // Endereços que não são http(s) não viram link.
  ["news", "## Título\nTexto.\n\nFonte: [Jornal](javascript:alert(1))\n\n[Abrir](javascript:alert(1))\n\n## Lista\n- [Item](javascript:x): texto\n"],
  // Listas: numerada, com caixa de tarefa, com continuação, com outro marcador e com texto no meio (deixa de ser lista).
  ["email_summary", "## Lista\n1. **Um** — primeiro\n2) [ ] **Dois**: segundo\n   continua aqui\n* [x] feito\n+ `código` e *ênfase*\n\n## Não é lista\n- item\n\nUm parágrafo.\n"],
  // Minutagem com hora, só a minutagem no link e intervalo com hífen.
  [
    "youtube_transcript",
    "## Partes\n- [1:02:03](#t-3723): tarde\n- [Tema](https://youtu.be/dQw4w9WgXcQ?t=5) (00:05)\n\n## Picos\n- [0:10-0:20](#t-10)\n- [1:00:00 — 1:00:30](#t-3600): fim\n\n## Texto\n{#t-10} [00:10](https://youtu.be/x?t=10) **Ana Lima:** Oi.\n\n{#t-3600} [1:00:00](https://youtu.be/x?t=3600) **ana lima**: De novo.\n\n{#intro} fora da convenção\n",
  ],
  // Fonte que não é vídeo, subtítulos de níveis diferentes e texto antes do primeiro subtítulo.
  ["news", "Fonte: [Folha \\[do\\] Vale](https://folha.example.com/a)\n\nAbertura.\n\n## Mundo\nUma nota do grupo.\n\n#### Fundo\nTexto.\n\n### Raso\nOutro.\n\n## Vazio\n\n## Solto\nTexto solto.\n"],
  // Um grupo só: o número dele repetiria o total, então não há números.
  ["email_summary", "## Único\n### A\nDe: Zé\n### B\nPrazo: Hoje cedo\n"],
  // Acentos, espaço sem quebra e iniciais fora do ASCII.
  ["email_summary", "## Ação\n### Olá\nDe: Érica  Ônix Çelik · às 9h\nPrazo: VENCIDO há dois dias\n\n## Outro\n- **Ímpar:** texto\n"],
];

/** De que jeito cada artefato é lido: os três tipos de resumo, a nota que é a transcrição de um vídeo e o que fica em markdown. */
const TYPE_CASES: [string, string][] = [
  ["news", "qualquer texto"],
  ["email_summary", ""],
  ["youtube_transcript", ""],
  ["text", YOUTUBE_TRANSCRIPT_SAMPLE],
  ["text", "\r\n\r\nFonte: [YouTube](https://youtu.be/dQw4w9WgXcQ)\r\n\r\n## Transcrição\r\n{#t-0} Oi."],
  ["text", "Fonte: [Palestra](https://www.youtube.com/live/dQw4w9WgXcQ?si=abc) · Canal\n\n{#t-12} Só a fala."],
  ["text", "## Compras\n- pão"],
  ["text", ""],
  ["text", "Fonte: [Jornal](https://jornal.example.com/a)\n\n## Título\n{#t-0} Texto."],
  ["text", "Fonte: [YouTube](https://www.youtube.com/@canal)\n\n{#t-0} Texto."],
  ["text", "Fonte: [YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\nTranscrição em andamento."],
  ["text", "Texto antes.\n\nFonte: [YouTube](https://youtu.be/dQw4w9WgXcQ)\n\n{#t-0} Oi."],
  ["text", "Fonte: [YouTube](https://youtu.be/dQw4w9WgXcQ)\n\nNo meio {#t-0} não é trecho."],
  ["router", YOUTUBE_TRANSCRIPT_SAMPLE],
  ["food", YOUTUBE_TRANSCRIPT_SAMPLE],
];

export function summaryCardsFixtures() {
  return {
    "summary-cards": {
      summaryCardsOf: CASES.map(([type, markdown]) => ({ args: [type, markdown], result: summaryCardsOf(type, markdown) })),
      summaryCardsTypeOf: TYPE_CASES.map(([type, markdown]) => ({ args: [type, markdown], result: summaryCardsTypeOf(type, markdown) })),
    },
  };
}
