"use client";

import { Bot, ChevronLeft, Layers, type LucideIcon, Search, User } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useViewMode, type ViewModeId, writeViewMode } from "@/lib/tasks/view-mode";
import { type SectionId, useSectionMenu } from "@/lib/navigation/section-menu";
import styles from "./section-menu.module.css";

/** De quem são as tarefas: três listas como as outras, cada uma com o ponto da cor do seu modo. */
const MODE_LISTS: { id: ViewModeId; name: string; desc: string; notesDesc: string; Icon: LucideIcon }[] = [
  { id: "all", name: "Todos", desc: "você e agentes", notesDesc: "você e agentes", Icon: Layers },
  { id: "human", name: "Você", desc: "só as suas tarefas", notesDesc: "só os seus documentos", Icon: User },
  { id: "agent", name: "Agentes", desc: "só tarefas de agentes", notesDesc: "só documentos de agentes", Icon: Bot },
];

/** A ordem da cascata: o que está mais perto do polegar sobe primeiro. */
function TwoLineSliders() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h7M14 8h7M14 6v4" />
      <path d="M3 16h7M14 16h7M10 14v4" />
    </svg>
  );
}

const step = (value: number) => ({ "--s": value }) as CSSProperties;

/**
 * O menu de opções da barra inferior: tocar na aba já selecionada faz a barra
 * crescer para cima com o nome da tela, a engrenagem, as listas e a busca logo
 * acima das abas. As três telas abrem com as listas de quem (Todos, Você,
 * Agentes); o resto vem da tela (`lib/navigation/section-menu.ts`). Escolher
 * uma lista fecha o menu; a engrenagem troca o corpo pela configuração.
 */
export function SectionMenu({ id, section, title, open, onClose, structuredSettings = false }: { id: string; section: SectionId; title: string; open: boolean; onClose: () => void; structuredSettings?: boolean }) {
  const model = useSectionMenu(section);
  const viewMode = useViewMode();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pickTimer = useRef<number | undefined>(undefined);
  const settings = model?.settings ?? [];
  const lists = model?.lists ?? [];

  // A configuração só volta ao início depois de a barra fechar, para não trocar de corpo no meio da saída.
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setSettingsOpen(false), 360);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => () => window.clearTimeout(pickTimer.current), []);

  // A linha escolhida acende antes de o menu fechar.
  function pick(action: () => void) {
    action();
    window.clearTimeout(pickTimer.current);
    pickTimer.current = window.setTimeout(onClose, 180);
  }

  const lower = title.toLocaleLowerCase("pt-BR");
  let index = 0;
  const cascade = () => step(Math.max(1, 5 - index++));

  return (
    <section id={id} className={styles.menu} data-open={open ? "" : undefined} data-structured-settings={structuredSettings ? "" : undefined} aria-label={`Opções de ${lower}`} aria-hidden={!open}>
      <div className={styles.inner}>
        <div className={styles.pad}>
          <div className={`${styles.head} ${styles.st}`} style={step(7)}>
            {settingsOpen && structuredSettings ? (
              <>
                <button type="button" className={styles.back} aria-label="Voltar para as listas" onClick={() => setSettingsOpen(false)}><ChevronLeft aria-hidden /></button>
                <h2 className={styles.settingsTitle}>Configurar {lower}</h2>
              </>
            ) : settingsOpen ? (
              <button type="button" className={styles.back} onClick={() => setSettingsOpen(false)}><ChevronLeft aria-hidden />Configurar {lower}</button>
            ) : (
              <h2 className={styles.title}>{title}{model?.count !== undefined ? <span>{model.count}</span> : null}</h2>
            )}
            {settings.length > 0 ? (
              <button type="button" className={styles.gear} aria-pressed={settingsOpen} aria-label={settingsOpen ? "Fechar configuração" : `Configurar ${lower}`} onClick={() => setSettingsOpen((current) => !current)}><TwoLineSliders /></button>
            ) : null}
          </div>

          {settingsOpen ? (
            <div className={`${styles.pane} ${styles.settingsPane}`} key="settings">
              {settings.map((setting) => {
                if (setting.kind === "switch") {
                  return structuredSettings ? (
                    <div key={setting.label} className={styles.switchSetting}>
                      <p className={styles.label}>{setting.label}</p>
                      <button type="button" role="switch" aria-label={setting.label} aria-checked={setting.on} className={styles.switchOption} onClick={setting.onToggle}>
                        <span className={styles.switch} aria-hidden><i /></span>
                        {setting.hint ? <span className={styles.optionText}><small>{setting.hint}</small></span> : null}
                      </button>
                    </div>
                  ) : (
                    <button key={setting.label} type="button" role="switch" aria-checked={setting.on} className={styles.option} onClick={setting.onToggle}>
                      <span className={styles.optionText}>{setting.label}{setting.hint ? <small>{setting.hint}</small> : null}</span>
                      <span className={styles.switch} aria-hidden><i /></span>
                    </button>
                  );
                }
                return (
                  <div key={setting.label}>
                    <p className={styles.label}>{setting.label}</p>
                    <fieldset className={setting.kind === "segment" ? styles.segment : styles.toggles} aria-label={setting.label}>
                      {setting.options.map((choice) => (
                        <button key={choice.label} type="button" aria-pressed={choice.selected} onClick={choice.onPick}>{choice.label}</button>
                      ))}
                    </fieldset>
                  </div>
                );
              })}
              {model?.filtered && model.onClear ? <button type="button" className={styles.clear} onClick={model.onClear}>Limpar filtros</button> : null}
            </div>
          ) : (
            <div className={styles.pane} key="main">
              <fieldset className={styles.list} aria-label="Listas">
                  <p className={`${styles.label} ${styles.st}`} style={step(5)}>Listas</p>
                  {MODE_LISTS.map((mode) => (
                    <button key={mode.id} type="button" className={`${styles.item} ${styles.st}`} style={cascade()} aria-pressed={viewMode.id === mode.id} onClick={() => pick(() => writeViewMode(mode.id))}>
                      <span className={styles.icon} aria-hidden><mode.Icon /></span>
                      <span className={styles.body}>
                        <span className={styles.nameRow}><span className={styles.name}>{mode.name}</span><i className={styles.dot} data-who={mode.id} aria-hidden /></span>
                        <span className={styles.desc}>{section === "notes" ? mode.notesDesc : mode.desc}</span>
                      </span>
                    </button>
                  ))}
                  {lists.map((list) => (
                    <button key={list.id} type="button" className={`${styles.item} ${styles.st}`} style={cascade()} aria-pressed={list.selected} onClick={() => pick(list.onPick)}>
                      <span className={styles.icon} aria-hidden><list.Icon /></span>
                      <span className={styles.body}>
                        <span className={styles.nameRow}><span className={styles.name}>{list.name}</span></span>
                        {list.desc ? <span className={styles.desc}>{list.desc}</span> : null}
                      </span>
                      {list.count !== undefined ? <span className={styles.count}>{list.count}</span> : null}
                    </button>
                  ))}
              </fieldset>
              {model?.search ? (
                <label className={`${styles.field} ${styles.st}`} style={step(0)}>
                  <Search aria-hidden />
                  <input
                    type="search"
                    enterKeyHint="search"
                    aria-label={model.search.label}
                    placeholder={model.search.label}
                    value={model.search.value}
                    onChange={(event) => model.search?.onChange(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") onClose(); }}
                  />
                </label>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
