import { Check, ChevronRight, LoaderCircle, X } from "lucide-react";
import type { HermesStepDto } from "@/lib/ai-automation/ai-automation";
import styles from "@/components/shell/shell.module.css";

const STATUS_TEXT: Record<HermesStepDto["status"], string> = {
  running: "em andamento",
  done: "concluído",
  failed: "falhou",
};

/**
 * Os passos do Hermes (ADR 004), como o agente os dá: cada ferramenta numa linha, com o que ele mostrou (comando,
 * arquivo, busca), e cada pensamento recolhido, que se abre para ler. Ao vivo enquanto ele trabalha e, depois, o
 * registro do que foi feito.
 */
export function HermesSteps({ steps, running }: { steps: HermesStepDto[]; running: boolean }) {
  return (
    <section className={styles.hermesSteps} aria-label="Passos do Hermes" data-running={running}>
      <ul>
        {steps.map((step) => (
          <li key={step.id} data-kind={step.kind} data-status={step.status}>
            {step.kind === "thought" ? (
              <details>
                <summary>
                  <ChevronRight aria-hidden />
                  {step.label}
                </summary>
                {step.detail && <p>{step.detail}</p>}
              </details>
            ) : (
              <div className={styles.hermesTool}>
                <span className={styles.hermesMark} aria-hidden>
                  {step.status === "done" && <Check />}
                  {step.status === "failed" && <X />}
                  {step.status === "running" && <LoaderCircle data-spin />}
                </span>
                <span>{step.label}</span>
                {step.detail && <code>{step.detail}</code>}
                <span className={styles.srOnly}>{STATUS_TEXT[step.status]}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
