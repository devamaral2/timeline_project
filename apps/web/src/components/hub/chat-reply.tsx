import { Check, ChevronRight, Copy } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HermesBot } from "@/components/ui/hermes-bot";
import styles from "@/components/shell/shell.module.css";

/**
 * A fala do assistente na conversa (canvas "Chat com o Hermes — conversa limpa", opção B): texto solto, sem caixa, sob
 * o robô cinza e o nome de quem responde. O robô não é o `HermesMark`: o voo do botão do chat procura aquele
 * (`data-hermes-mark`) na linha de status e não pode achar este antes.
 */
export function ChatReply({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <div className={styles.chatWho}>
        <span className={styles.chatAvatar}>
          <HermesBot plain />
        </span>
        {name}
      </div>
      {children}
    </>
  );
}

/** Quanto tempo o ✓ de "copiada" fica no lugar do ícone de copiar. */
const COPIED_MS = 1600;

interface ChatActionsProps {
  /** O texto da resposta, como o agente o escreveu: é o que vai para a área de transferência. */
  text: string;
  /** Quantos passos o pedido teve; sem passos, o atalho para a aba "Processo" não aparece. */
  steps: number;
  onOpenProcess: () => void;
}

/**
 * O que dá para fazer com a última resposta, encostado nela: copiar o texto e abrir os passos do pedido na aba
 * "Processo". Refazer o pedido ficou de fora de propósito: repetir um pedido que criou registros os duplicaria.
 */
export function ChatActions({ text, steps, onOpenProcess }: ChatActionsProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function copy() {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
      },
      // Sem permissão para a área de transferência nada muda: o ícone segue o de copiar.
      () => {},
    );
  }

  return (
    <li className={styles.chatActions} data-role="actions">
      <button type="button" onClick={copy} aria-label={copied ? "Resposta copiada" : "Copiar a resposta"}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </button>
      {steps > 0 ? (
        <button type="button" data-trace onClick={onOpenProcess}>
          {steps === 1 ? "1 passo" : `${steps} passos`}
          <ChevronRight aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
