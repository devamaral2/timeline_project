import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Components, Options } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { choiceLabel, remarkAnswer, shortUrl } from "@/lib/agent-chat/answer-format";
import styles from "./chat-answer.module.css";

const remarkPlugins = [remarkGfm, remarkAnswer] as Options["remarkPlugins"];

function parseChoices(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function isBareUrl(href: string | undefined, children: ReactNode): href is string {
  return typeof href === "string" && typeof children === "string" && children.replace(/\/$/, "") === href.replace(/\/$/, "");
}

/**
 * A resposta do agente (canvas "Resposta do Hermes — formatação", opção A): o texto dele lido como markdown, com
 * termos técnicos em código, endereços encurtados e os passos numerados entre fios. Quando ele pede para dizer uma
 * entre alternativas, elas viram botões: tocar envia a alternativa como a próxima mensagem. Sem `onChoose` os
 * botões ficam desligados (resposta antiga ou pedido em andamento). HTML cru nunca é interpretado e imagens viram
 * o texto alternativo.
 */
export function ChatAnswer({ text, onChoose }: { text: string; onChoose?: (choice: string) => void }) {
  const components: Components = {
    p: ({ children, node: _node, ...props }) => {
      const rest = props as Record<string, unknown>;
      if (rest["data-label"]) return <p className={styles.label}>{children}</p>;
      const choices = parseChoices(rest["data-choices"]);
      if (choices.length === 0) return <p>{children}</p>;
      return (
        <>
          <p>{children}</p>
          <fieldset className={styles.choices} aria-label="Escolha uma resposta" disabled={!onChoose}>
            {choices.map((choice) => (
              <button key={choice} type="button" onClick={() => onChoose?.(choice)}>
                {choiceLabel(choice)}
              </button>
            ))}
          </fieldset>
        </>
      );
    },
    a: ({ href, children }) => {
      const external = /^https?:\/\//i.test(href ?? "");
      const bare = isBareUrl(href, children);
      return (
        <a
          href={href}
          className={bare ? styles.url : undefined}
          title={bare ? href : undefined}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {bare ? shortUrl(href) : children}
          {external && <ArrowUpRight className={styles.linkIcon} aria-hidden />}
        </a>
      );
    },
    h1: ({ children }) => <h3>{children}</h3>,
    h2: ({ children }) => <h3>{children}</h3>,
    h4: ({ children }) => <h3>{children}</h3>,
    h5: ({ children }) => <h3>{children}</h3>,
    h6: ({ children }) => <h3>{children}</h3>,
    img: ({ alt }) => <span>{alt}</span>,
    table: ({ children }) => (
      <div className={styles.tableBox}>
        <table>{children}</table>
      </div>
    ),
    input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} readOnly disabled aria-label={checked ? "Feito" : "A fazer"} />,
  };

  return (
    <div className={styles.answer}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
