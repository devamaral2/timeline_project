import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import styles from "./markdown.module.css";

const remarkPlugins = [remarkGfm];

/**
 * O markdown de uma nota. HTML cru nunca é interpretado (o react-markdown o
 * trata como texto) e o título `#` desce para `h2`: o `h1` da página é o nome
 * da nota. Imagens viram o texto alternativo, para que uma nota não dispare
 * requisições a servidores de terceiros só por ser aberta.
 */
const components: Components = {
  h1: ({ children }) => <h2 data-level="1">{children}</h2>,
  a: ({ href, children }) => {
    const external = /^https?:\/\//i.test(href ?? "");
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  },
  img: ({ alt }) => <span>{alt}</span>,
  input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} readOnly disabled aria-label={checked ? "Feito" : "A fazer"} />,
};

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn(styles.markdown, className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
