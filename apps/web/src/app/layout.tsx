import type { Metadata, Viewport } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Time Composure",
  description: "Sua vida organizada. Sua mente em equilíbrio.",
};

/*
 * A identidade do produto e escura: o tema claro continua definido no
 * globals.css e em `@repo/theme`, mas nao e o que o app abre. Por isso a classe
 * `dark` vem fixa no <html> — e nao de `prefers-color-scheme`.
 *
 * `colorScheme` acompanha para que o browser pinte no escuro tambem o que nao e
 * nosso (barras de rolagem, campos nativos), e `themeColor` e o mesmo
 * `--background` da paleta, para a barra do navegador no celular.
 */
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0f131c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
