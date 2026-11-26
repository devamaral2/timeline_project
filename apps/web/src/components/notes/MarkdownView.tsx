"use client";

import { Image as ImageIcon } from "lucide-react";
import { Children, createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Components, ExtraProps } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { internalAnchorOf, splitAnchorMark } from "@/lib/notes/anchors";
import { youtubeEmbedUrl, youtubeVideoOf, type YouTubeVideo } from "@/lib/notes/youtube";
import { cn } from "@/lib/utils";
import styles from "./markdown.module.css";

const remarkPlugins = [remarkGfm];

/** As imagens de um documento aparecem todas juntas, quando a pessoa pede. */
const ImagesContext = createContext<{ shown: boolean; show: () => void }>({ shown: false, show: () => {} });

function isRemote(href: string | undefined): boolean {
  return /^https?:\/\//i.test(href ?? "");
}

function ExternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a href={href} {...(isRemote(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

/**
 * Uma imagem só é buscada depois que a pessoa pede: abrir um documento não
 * dispara requisição ao servidor de quem hospeda a imagem, que poderia medir a
 * leitura ou receber dados pelo endereço. Pedida, vai sem `Referer`.
 */
function MarkdownImage({ src, alt }: { src?: unknown; alt?: string }) {
  const { shown, show } = useContext(ImagesContext);
  if (typeof src !== "string" || !isRemote(src)) return <span>{alt}</span>;
  if (!shown) {
    return (
      <button type="button" className={styles.imagePlaceholder} onClick={show} aria-label={`Mostrar imagens${alt ? `: ${alt}` : ""}`}>
        <ImageIcon aria-hidden strokeWidth={1.75} />
        <span>{alt || "Imagem"}</span>
        <small>Mostrar imagens</small>
      </button>
    );
  }
  // biome-ignore lint/performance/noImgElement: imagem de outro site, sem tamanho conhecido; o otimizador do Next a buscaria pelo servidor.
  return <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}

type HastNode = NonNullable<ExtraProps["node"]>["children"][number];

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value;
  return node.type === "element" ? node.children.map(textOf).join("") : "";
}

/**
 * O vídeo de um parágrafo que é só um link do YouTube. Um link no meio de uma
 * frase continua link: só o endereço sozinho na linha vira player.
 */
function soleYouTubeLink(node: ExtraProps["node"]): { href: string; label: string; video: YouTubeVideo } | null {
  const children = node?.children.filter((child) => !(child.type === "text" && !child.value.trim())) ?? [];
  const [only] = children;
  if (children.length !== 1 || only?.type !== "element" || only.tagName !== "a") return null;
  const href = only.properties.href;
  if (typeof href !== "string") return null;
  const video = youtubeVideoOf(href);
  return video ? { href, label: textOf(only).trim(), video } : null;
}

/**
 * O player vai só ao YouTube, um destino fixo: diferente de uma imagem, o
 * endereço não leva nada a um servidor qualquer. Carrega quando chega perto da
 * tela e fica isolado na moldura; o link original segue embaixo.
 */
function YouTubePlayer({ href, label, video }: { href: string; label: string; video: YouTubeVideo }) {
  // Um link automático tem o próprio endereço como texto: repeti-lo como legenda seria ruído.
  const titled = label && !isRemote(label) && !label.startsWith("www.");
  return (
    <figure className={styles.video}>
      <iframe
        src={youtubeEmbedUrl(video)}
        title={titled ? label : "Vídeo do YouTube"}
        loading="lazy"
        allow="accelerometer; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        // O YouTube recusa o player (erro 153) quando a moldura não diz de que origem veio.
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      />
      <figcaption>
        <ExternalLink href={href}>{titled ? label : "Abrir no YouTube"}</ExternalLink>
      </figcaption>
    </figure>
  );
}

/**
 * O markdown de uma nota. HTML cru nunca é interpretado (o react-markdown o
 * trata como texto) e o título `#` desce para `h2`: o `h1` da página é o nome
 * da nota. Um link do YouTube sozinho na linha vira o player; as imagens
 * esperam a pessoa pedir.
 */
const components: Components = {
  h1: ({ children }) => <h2 data-level="1">{children}</h2>,
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  p: ({ node, children }) => {
    const link = soleYouTubeLink(node);
    if (link) return <YouTubePlayer {...link} />;
    // Um parágrafo que abre com `{#t-125}` é o trecho daquele instante: a marca vira o id e não aparece.
    const [first, ...rest] = Children.toArray(children);
    const mark = typeof first === "string" ? splitAnchorMark(first) : null;
    if (!mark) return <p>{children}</p>;
    return (
      <p id={mark.id} className={styles.anchor}>
        {mark.rest}
        {rest}
      </p>
    );
  },
  img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
  input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} readOnly disabled aria-label={checked ? "Feito" : "A fazer"} />,
};

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const [shown, setShown] = useState(false);
  const images = useMemo(() => ({ shown, show: () => setShown(true) }), [shown]);
  const root = useRef<HTMLDivElement>(null);
  // Um link `#t-125` rola até o trecho deste documento; o resto do documento da página não é tocado. O ouvinte é do
  // próprio nó (os links já são focáveis e respondem ao teclado), então a `div` não precisa de papel interativo.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const followAnchor = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      const id = internalAnchorOf(link?.getAttribute("href"));
      if (!id) return;
      event.preventDefault();
      node.querySelector(`[id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    node.addEventListener("click", followAnchor);
    return () => node.removeEventListener("click", followAnchor);
  }, []);
  return (
    <div ref={root} className={cn(styles.markdown, className)}>
      <ImagesContext.Provider value={images}>
        <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
          {source}
        </ReactMarkdown>
      </ImagesContext.Provider>
    </div>
  );
}
