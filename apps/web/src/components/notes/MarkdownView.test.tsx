import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
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
