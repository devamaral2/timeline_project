"use client";

import { ArrowUp, CalendarDays, NotepadText, Plus, Search, SquareCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { EXAMPLE_TODAY, exampleEventsOn } from "./agenda-examples";
import { BraidAssistantIcon, SearchCreateIcon } from "./navigation-icons";
import styles from "./mockup.module.css";

type Kind = "Evento" | "Tarefa" | "Nota";
type Entry = { id: string; title: string; kind: Kind };
const initialEntries: Entry[] = [
  ...exampleEventsOn(EXAMPLE_TODAY).map((event, index) => ({ id: `event-${index}`, title: event.name, kind: "Evento" as const })),
  ...exampleEventsOn(EXAMPLE_TODAY).flatMap(event => event.task ? [{ id: event.task.id, title: event.name, kind: "Tarefa" as const }] : []),
  { id: "note-1", title: "Ideias para a proposta", kind: "Nota" },
];
const icons = { Evento: CalendarDays, Tarefa: SquareCheck, Nota: NotepadText };

export function MobileNavigation() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<"hub" | "Tarefa" | "Nota" | null>(null);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("Evento");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState(initialEntries);
  const [prompt, setPrompt] = useState("");
  const [sentPrompt, setSentPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const dialogId = useId();
  const titleId = useId();

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 721px)");
    const closeOnDesktop = () => { if (desktop.matches) dialogRef.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function openPanel(next: "hub" | "Tarefa" | "Nota") {
    setPanel(next);
    setQuery("");
    setCreating(false);
    setNotice("");
    if (next !== "hub") setKind(next);
    dialogRef.current?.showModal();
  }

  const visibleEntries = entries.filter(entry => (panel === "hub" || entry.kind === panel) && entry.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));

  return (
    <>
      <nav className={styles.bottomNav} aria-label="Navegação inferior">
        <button type="button" onClick={() => openPanel("Tarefa")} aria-haspopup="dialog" aria-expanded={panel === "Tarefa"} aria-controls={dialogId}><SquareCheck aria-hidden /><span>Tarefas</span></button>
        <Link href="/mockups/eventos" aria-current={panel ? undefined : "page"}><CalendarDays aria-hidden /><span>Agenda</span></Link>
        <button type="button" onClick={() => openPanel("Nota")} aria-haspopup="dialog" aria-expanded={panel === "Nota"} aria-controls={dialogId}><NotepadText aria-hidden /><span>Notas</span></button>
        <button type="button" className={styles.commandButton} onClick={() => openPanel("hub")} aria-haspopup="dialog" aria-expanded={panel === "hub"} aria-controls={dialogId} aria-label="Buscar e criar"><span className={styles.commandGlyph}><SearchCreateIcon /></span><span>Buscar e criar</span></button>
      </nav>
      <dialog ref={dialogRef} id={dialogId} aria-labelledby={titleId} className={styles.sectionMenu} onClose={() => setPanel(null)}
        onPointerDown={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { event.preventDefault(); dialogRef.current?.close(); }
        }}>
        <div className={styles.sheetHandle} aria-hidden />
        <div className={styles.sectionMenuHeading}>
          <h2 id={titleId}>{panel === "hub" ? "Buscar e criar" : panel === "Tarefa" ? "Tarefas" : "Notas"}</h2>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Fechar painel"><X aria-hidden /></button>
        </div>
        {panel === "hub" && <>
          <p className={styles.hubDescription}>Eventos, tarefas e notas. Tudo começa aqui.</p>
          <fieldset className={styles.hubModes} aria-label="Modo de busca e criação">
            <button type="button" aria-pressed={mode === "ai"} onClick={() => setMode("ai")}><BraidAssistantIcon />Com IA</button>
            <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}><SearchCreateIcon />Manual</button>
          </fieldset>
        </>}
        {panel === "hub" && mode === "ai" ? <div className={styles.assistantPanel}>
          <div className={styles.assistantWelcome}><BraidAssistantIcon /><h3>O que vamos fazer?</h3><p>Encontre o que precisa ou transforme uma ideia em algo para o seu dia.</p></div>
          <div className={styles.promptSuggestions}>
            {["O que tenho na agenda hoje?", "Criar uma tarefa", "Anotar uma ideia"].map(suggestion => <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}
          </div>
          {sentPrompt && <div className={styles.chatPreview}><p>{sentPrompt}</p><span>Esta é uma prévia da conversa. Use o modo Manual para experimentar a busca e criar um rascunho.</span><button type="button" onClick={() => setMode("manual")}>Abrir modo Manual</button></div>}
          <form className={styles.hubComposer} onSubmit={event => { event.preventDefault(); if (prompt.trim()) { setSentPrompt(prompt.trim()); setPrompt(""); } }}>
            <input aria-label="Mensagem para a IA" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Pergunte ou peça para criar…" />
            <button type="submit" disabled={!prompt.trim()} aria-label="Enviar mensagem"><ArrowUp aria-hidden /></button>
          </form>
        </div> : <div className={styles.manualPanel}>
          <label className={styles.hubSearch}><Search aria-hidden /><input aria-label="Buscar eventos, tarefas e notas" value={query} onChange={event => setQuery(event.target.value)} placeholder={panel === "hub" ? "Buscar eventos, tarefas e notas" : `Buscar ${panel === "Tarefa" ? "tarefas" : "notas"}`} /></label>
          <div className={styles.manualHeading}><h3>{query ? "Resultados" : "No seu espaço"}</h3><button type="button" onClick={() => { setCreating(!creating); setNotice(""); }}><Plus aria-hidden />Criar novo</button></div>
          {creating && <form className={styles.quickCreate} onSubmit={event => {
            event.preventDefault();
            if (!title.trim()) return;
            setEntries(current => [{ id: `draft-${Date.now()}`, title: title.trim(), kind }, ...current]);
            setTitle(""); setQuery(""); setCreating(false); setNotice(`${kind}: rascunho adicionado à prévia.`);
          }}>
            <label>Tipo<select value={kind} onChange={event => setKind(event.target.value as Kind)} disabled={panel !== "hub"}><option>Evento</option><option>Tarefa</option><option>Nota</option></select></label>
            <label>Título<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Dê um nome à sua ideia" required /></label>
            <button type="submit" disabled={!title.trim()}>Criar rascunho</button>
          </form>}
          <p className={styles.hubNotice} role="status">{notice}</p>
          <ul className={styles.hubResults}>{visibleEntries.map(entry => { const Icon = icons[entry.kind]; return <li key={entry.id}><Icon aria-hidden /><span>{entry.title}<small>{entry.kind}</small></span></li>; })}</ul>
          {visibleEntries.length === 0 && <p className={styles.hubDescription}>Nenhum resultado. Que tal criar algo novo?</p>}
        </div>}
        <p className={styles.hubFootnote}>Prévia interativa · dados de exemplo · rascunhos só nesta sessão</p>
      </dialog>
    </>
  );
}
