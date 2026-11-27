import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MarkdownView } from "./MarkdownView";

test("um link do YouTube sozinho na linha vira o player, com o link original embaixo", () => {
  const { container } = render(
    <MarkdownView source={"Antes\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90\n\n[Palestra](https://youtu.be/aqz-KE-bpKQ)"} />,
  );

  const players = container.querySelectorAll("iframe");
  expect(players).toHaveLength(2);
  expect(players[0]).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
  expect(players[0]).toHaveAttribute("title", "Vídeo do YouTube");
  expect(players[0]).toHaveAttribute("loading", "lazy");
  expect(players[0]).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  expect(players[1]).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ");
  expect(players[1]).toHaveAttribute("title", "Palestra");
  expect(screen.getByRole("link", { name: "Abrir no YouTube" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90");
  expect(screen.getByRole("link", { name: "Palestra" })).toHaveAttribute("href", "https://youtu.be/aqz-KE-bpKQ");
});

test("um link do YouTube no meio da frase, ou de outro site, continua link", () => {
  const { container } = render(
    <MarkdownView source={"Veja https://youtu.be/dQw4w9WgXcQ depois.\n\nhttps://vimeo.com/123456\n\nhttps://www.youtube.com/@canal"} />,
  );

  expect(container.querySelector("iframe")).toBeNull();
  expect(screen.getByRole("link", { name: "https://youtu.be/dQw4w9WgXcQ" })).toBeInTheDocument();
});

test("as imagens só são buscadas quando a pessoa pede, todas de uma vez e sem Referer", () => {
  const { container } = render(
    <MarkdownView source={"![Gráfico da inflação](https://cdn.exemplo.dev/a.png)\n\n![](https://cdn.exemplo.dev/b.png)\n\n![local](/c.png)"} />,
  );

  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("Gráfico da inflação")).toBeInTheDocument();
  expect(screen.getByText("local").tagName).toBe("SPAN");

  fireEvent.click(screen.getByRole("button", { name: "Mostrar imagens: Gráfico da inflação" }));

  const images = container.querySelectorAll("img");
  expect(images).toHaveLength(2);
  expect(images[0]).toHaveAttribute("src", "https://cdn.exemplo.dev/a.png");
  expect(images[0]).toHaveAttribute("alt", "Gráfico da inflação");
  expect(images[0]).toHaveAttribute("referrerpolicy", "no-referrer");
  expect(images[0]).toHaveAttribute("loading", "lazy");
  expect(screen.queryByRole("button")).toBeNull();
});

const SOURCE = [
  "## Resumo",
  "- [Abertura](#t-0)",
  "- [O ponto central](#t-125)",
  "- [Fonte](https://exemplo.dev/a)",
  "## Transcrição",
  "{#t-0} [00:00](https://youtu.be/dQw4w9WgXcQ?t=0) **Ana:** Bem-vindos.",
  "{#t-125} [02:05](https://youtu.be/dQw4w9WgXcQ?t=125) **Bia:** O ponto central é este.",
  "{#outro} fica como texto",
].join("\n\n");

const scrolled = vi.fn();
Element.prototype.scrollIntoView = scrolled;
afterEach(() => scrolled.mockClear());

test("um bloco que começa com {#t-segundos} vira a âncora do trecho, sem mostrar a marca", () => {
  const { container } = render(<MarkdownView source={SOURCE} />);

  const block = container.querySelector("#t-125");
  expect(block?.tagName).toBe("P");
  expect(block).toHaveTextContent("02:05 Bia: O ponto central é este.");
  expect(block?.textContent).not.toContain("{#");
  expect(container.querySelector("#t-0")).toHaveTextContent("00:00 Ana: Bem-vindos.");
  // Só a convenção t-<segundos> vira âncora; outro id continua texto, para um artefato não tomar ids da página.
  expect(container.querySelector("#outro")).toBeNull();
  expect(screen.getByText("{#outro} fica como texto")).toBeInTheDocument();
});

test("tocar num link interno rola até o trecho dentro do mesmo artefato", () => {
  const { container } = render(<MarkdownView source={SOURCE} />);

  fireEvent.click(screen.getByRole("link", { name: "O ponto central" }));

  expect(scrolled).toHaveBeenCalledTimes(1);
  expect(scrolled.mock.contexts[0]).toBe(container.querySelector("#t-125"));
});

test("um link interno sem trecho correspondente não rola e não quebra", () => {
  render(<MarkdownView source={"[Sumiu](#t-999)"} />);

  fireEvent.click(screen.getByRole("link", { name: "Sumiu" }));

  expect(scrolled).not.toHaveBeenCalled();
});

test("links externos e o player do YouTube seguem como estão, mesmo ao lado de âncoras", () => {
  const { container } = render(<MarkdownView source={`${SOURCE}\n\nhttps://youtu.be/dQw4w9WgXcQ`} />);

  const external = screen.getByRole("link", { name: "Fonte" });
  expect(external).toHaveAttribute("target", "_blank");
  expect(external).toHaveAttribute("rel", "noopener noreferrer");
  fireEvent.click(external);
  fireEvent.click(screen.getByRole("link", { name: "02:05" }));
  expect(scrolled).not.toHaveBeenCalled();
  expect(container.querySelectorAll("iframe")).toHaveLength(1);
});
