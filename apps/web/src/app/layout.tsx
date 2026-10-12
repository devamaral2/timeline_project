import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Braid",
  description: "Sua vida organizada. Sua mente em equilíbrio.",
};

/*
 * As tres vozes do Braid, locais e variaveis: Figtree na interface, Newsreader
 * nos titulos e na assinatura, JetBrains Mono so onde o numero e dado tecnico.
 * Cada uma vira uma custom property que o `@theme` do globals.css le em
 * `font-sans`, `font-display` e `font-mono`.
 */
const figtree = localFont({
  src: [
    { path: "../fonts/Figtree.ttf", weight: "300 900", style: "normal" },
    { path: "../fonts/Figtree-Italic.ttf", weight: "300 900", style: "italic" },
  ],
  variable: "--font-figtree",
  display: "swap",
});

const newsreader = localFont({
  src: [
    { path: "../fonts/Newsreader.ttf", weight: "200 800", style: "normal" },
    { path: "../fonts/Newsreader-Italic.ttf", weight: "200 800", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "../fonts/JetBrainsMono.ttf",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/*
 * O tema segue o sistema, e a pessoa pode fixar Névoa ou Noite — a escolha fica
 * em `braid-theme`, a mesma chave do seletor do cabecalho. Sem preferencia
 * nenhuma, abre na Névoa.
 *
 * O script roda no <head>, antes da primeira pintura, para a classe `dark` ja
 * estar no <html> quando o conteudo aparece. Enquanto nao ha escolha salva, ele
 * tambem acompanha a troca de esquema do sistema.
 */
const themeScript = `(function(){try{var d=document.documentElement,q=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=localStorage.getItem("braid-theme");d.classList.toggle("dark",t?t==="dark":q.matches)}a();q.addEventListener("change",a)}catch(e){}})()`;

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f5f6" },
    { media: "(prefers-color-scheme: dark)", color: "#141f29" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${figtree.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script constante, sem entrada do usuario */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
