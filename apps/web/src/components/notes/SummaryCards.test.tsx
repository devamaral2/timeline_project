import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { summaryCardsOf, type SummaryCardsType } from "@/lib/notes/summary-cards";
import { EMAIL_SUMMARY_SAMPLE, NEWS_SAMPLE, YOUTUBE_TRANSCRIPT_SAMPLE } from "@/lib/notes/summary-cards.samples";
import { SummaryCards } from "./SummaryCards";

function renderCards(type: SummaryCardsType, markdown: string) {
  const document = summaryCardsOf(type, markdown);
  if (!document) throw new Error("o texto não tem títulos");
  return render(<SummaryCards document={document} />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("o resumo de e-mail mostra os números, uma ficha por e-mail e uma ação preenchida só", () => {
  renderCards("email_summary", EMAIL_SUMMARY_SAMPLE);

  const score = screen.getByRole("list", { name: "Em números" });
  expect(within(score).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["14e-mails", "3pedem resposta", "1vence hoje"]);

  const group = screen.getByRole("region", { name: "Pedem resposta" });
  expect(within(group).getByRole("heading", { level: 2, name: "Pedem resposta" })).toBeInTheDocument();
  const card = within(group).getByRole("region", { name: "Documentos do imposto" });
  expect(within(card).getByRole("heading", { level: 3, name: "Documentos do imposto" })).toBeInTheDocument();
  expect(within(card).getByText("Marina Costa")).toBeInTheDocument();
  expect(within(card).getByText("MC")).toHaveAttribute("aria-hidden", "true");
  expect(within(card).getByText("09:12")).toBeInTheDocument();
  expect(within(card).getByText("hoje, 18h").closest("[data-tone]")).toHaveAttribute("data-tone", "soon");
  // As linhas "De:" e "Prazo:" saem do texto da ficha.
  expect(within(card).queryByText(/De:/)).toBeNull();

  const replies = screen.getAllByRole("link", { name: "Responder" });
  expect(replies).toHaveLength(2);
  expect(replies[0]).toHaveAttribute("href", "https://mail.example.com/t/1");
  expect(replies[0]).toHaveAttribute("target", "_blank");
  expect(replies[0]?.className).toContain("primary");
  expect(replies[1]?.className).not.toContain("primary");
});

test("a lista longa mostra cinco linhas e o resto quando a pessoa pede", () => {
  renderCards("email_summary", EMAIL_SUMMARY_SAMPLE);

  const group = screen.getByRole("region", { name: "Sem ação" });
  expect(within(group).getAllByRole("listitem")).toHaveLength(5);
  const toggle = within(group).getByRole("button", { name: "Mostrar todas (7)" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(toggle);

  expect(within(group).getAllByRole("listitem")).toHaveLength(7);
  expect(within(group).getByRole("button", { name: "Mostrar menos" })).toHaveAttribute("aria-expanded", "true");
  // Uma lista curta não tem o que estender.
  expect(within(screen.getByRole("region", { name: "Para saber" })).queryByRole("button")).toBeNull();
});

test("a notícia leva a editoria e as fontes na ficha, e o botão abre a primeira fonte", () => {
  renderCards("news", NEWS_SAMPLE);

  const card = screen.getByRole("region", { name: "Conta de luz fica mais barata em dezembro" });
  expect(within(card).getByText("Economia")).toBeInTheDocument();
  expect(within(card).getByRole("heading", { level: 2 })).toHaveAttribute("data-size", "lg");
  const sources = within(card).getByRole("list", { name: "Fontes" });
  expect(within(sources).getByRole("link", { name: "Folha do Vale" })).toHaveAttribute("href", "https://folhadovale.example.com/luz");
  expect(within(card).getByRole("link", { name: "Abrir a matéria: Conta de luz fica mais barata em dezembro" })).toHaveAttribute("href", "https://folhadovale.example.com/luz");

  // Só a primeira notícia abre em letra grande; a fonte sem endereço é etiqueta, não link.
  const last = screen.getByRole("region", { name: "Navegadores vão avisar quando uma extensão lê a página" });
  expect(within(last).getByRole("heading", { level: 2 })).not.toHaveAttribute("data-size");
  expect(within(last).getByText("Revista Trama")).toBeInTheDocument();
  expect(within(last).queryByRole("link")).toBeNull();
});

test("a transcrição abre com o player, as partes e os mais assistidos, e o texto fica atrás de um botão", () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const { container } = renderCards("youtube_transcript", YOUTUBE_TRANSCRIPT_SAMPLE);

  expect(container.querySelector("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  expect(screen.getByText(/Corpo em Pauta/)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Onde ficam no vídeo: 12:40–13:05, 37:20–38:00" })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Comentários" })).getByText(/episódio só sobre cochilo/)).toBeInTheDocument();

  // Fechada, a transcrição não está na tela.
  expect(screen.queryByText(/Hoje a conversa é sobre sono/)).toBeNull();
  const read = screen.getByRole("button", { name: "Ler a transcrição" });
  expect(read).toHaveAttribute("aria-expanded", "false");
  expect(read.className).toContain("primary");

  // Um link de parte abre a transcrição e rola até o trecho.
  fireEvent.click(screen.getByRole("link", { name: /O sono pesa mais que o treino/ }));

  expect(screen.getByText(/Hoje a conversa é sobre sono/)).toBeInTheDocument();
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[id="t-190"]')).not.toBeNull();
  expect(screen.getByRole("button", { name: "Recolher a transcrição" })).toHaveAttribute("aria-expanded", "true");
});
