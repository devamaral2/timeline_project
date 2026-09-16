"use client";

import { ArrowUp, CalendarDays, CirclePlus, NotepadText, Plus, Search, SquareCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { EXAMPLE_TODAY, exampleEventsOn } from "./agenda-examples";
import styles from "./mockup.module.css";
import { BraidAssistantIcon, IntelligenceIcon } from "./navigation-icons";

type Kind = "Evento" | "Tarefa" | "Nota";
type Category = "Rotina" | "Alimentação" | "Exercício";
type Entry = { id: string; title: string; kind: Kind; category?: Category; draft?: Record<string, string> };
const examples = { Rotina: "Organizar o dia", Alimentação: "Preparar um almoço leve", Exercício: "Treino de força" };
const initialEntries: Entry[] = [
  ...exampleEventsOn(EXAMPLE_TODAY).map((event, index) => ({ id: `event-${index}`, title: event.name, kind: "Evento" as const })),
  ...exampleEventsOn(EXAMPLE_TODAY).flatMap(event => event.task ? [{ id: event.task.id, title: event.name, kind: "Tarefa" as const }] : []),
  { id: "note-1", title: "Ideias para a proposta", kind: "Nota" },
];
const icons = { Evento: CalendarDays, Tarefa: SquareCheck, Nota: NotepadText };

export function MobileNavigation({ userId }: { userId?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<"hub" | "Tarefa" | "Nota" | null>(null);
  const [mode, setMode] = useState<"ai" | "create" | "search">("ai");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("Tarefa");
  const [category, setCategory] = useState<Category>("Rotina");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState(initialEntries);
  const [prompt, setPrompt] = useState("");
  const [sentPrompt, setSentPrompt] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const dialogId = useId();
  const titleId = useId();
  const createFormId = useId();
  const draftKey = `${kind}:${category}`;
  const draft = drafts[draftKey] ?? {};
  function updateDraft(field: string, value: string) {
    setDrafts(current => ({ ...current, [draftKey]: { ...current[draftKey], [field]: value } }));
  }
  function selectMode(next: "ai" | "create" | "search") {
    if (next === "create" && mode !== "create") { setKind("Tarefa"); setCategory("Rotina"); }
    setNotice("");
    setMode(next);
  }

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
    if (next === "hub") setMode("ai");
    if (next !== "hub") setKind(next);
    dialogRef.current?.showModal();
  }

  const visibleEntries = entries.filter(entry => (panel === "hub" || entry.kind === panel) && entry.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));

  return (
    <>
      <nav className={styles.bottomNav} aria-label="Navegação inferior">
        <button type="button" aria-label="Tarefas" onClick={() => openPanel("Tarefa")} aria-haspopup="dialog" aria-expanded={panel === "Tarefa"} aria-controls={dialogId}><SquareCheck aria-hidden /><span>Tarefas</span></button>
        <Link href={userId ? `/${userId}` : "/mockups/eventos"} aria-label="Agenda" aria-current={panel ? undefined : "page"}><CalendarDays aria-hidden /><span>Agenda</span></Link>
        <button type="button" aria-label="Notas" onClick={() => openPanel("Nota")} aria-haspopup="dialog" aria-expanded={panel === "Nota"} aria-controls={dialogId}><NotepadText aria-hidden /><span>Notas</span></button>
        <button type="button" className={styles.commandButton} onClick={() => openPanel("hub")} aria-haspopup="dialog" aria-expanded={panel === "hub"} aria-controls={dialogId} aria-label="Buscar e criar"><span className={styles.commandGlyph}><IntelligenceIcon /></span><span>Buscar e criar</span></button>
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
        <div className={styles.hubContent}>
        {panel === "hub" && mode === "ai" ? <div className={styles.assistantPanel}>
          <div className={styles.assistantWelcome}><BraidAssistantIcon /><h3>O que vamos fazer?</h3><p>Encontre o que precisa ou transforme uma ideia em algo para o seu dia.</p></div>
          <div className={styles.promptSuggestions}>
            {["O que tenho na agenda hoje?", "Criar uma tarefa", "Anotar uma ideia"].map(suggestion => <button type="button" key={suggestion} onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}
          </div>
          {sentPrompt && <div className={styles.chatPreview}><p>{sentPrompt}</p><span>Esta é uma prévia da conversa. Experimente criar ou pesquisar usando os ícones abaixo.</span></div>}
          <form className={styles.hubComposer} onSubmit={event => { event.preventDefault(); if (prompt.trim()) { setSentPrompt(prompt.trim()); setPrompt(""); } }}>
            <input aria-label="Mensagem para a IA" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Pergunte ou peça para criar…" />
            <button type="submit" disabled={!prompt.trim()} aria-label="Enviar mensagem"><ArrowUp aria-hidden /></button>
          </form>
        </div> : panel === "hub" && mode === "create" ? <>
          <form id={createFormId} className={styles.entityForm} onSubmit={event => {
            event.preventDefault();
            if (!draft.title?.trim()) return;
            setEntries(current => [{ id: `draft-${Date.now()}`, title: draft.title.trim(), kind, category, draft: { ...draft } }, ...current]);
            setDrafts(current => ({ ...current, [draftKey]: {} }));
            setNotice(`${kind} de ${category.toLocaleLowerCase("pt-BR")}: rascunho criado.`);
          }}>
            <div className={styles.entityHeading}><span>{(() => { const Icon = icons[kind]; return <Icon aria-hidden />; })()}</span><div><h3>{kind === "Evento" ? "Novo evento" : kind === "Nota" ? "Nova nota" : "Nova tarefa"}</h3><p>{category}</p></div></div>
            {kind === "Tarefa" && <label>Prioridade<select className={styles.entityControl} value={draft.priority ?? "normal"} onChange={event => updateDraft("priority", event.target.value)}><option value="normal">Normal</option><option value="urgent">Urgente</option><option value="flexible">Flexível</option></select></label>}
            {kind === "Evento" && <div className={styles.entityFields}><label>Data<input type="date" value={draft.date ?? EXAMPLE_TODAY} onChange={event => updateDraft("date", event.target.value)} /></label><label>Horário<input type="time" value={draft.time ?? "09:00"} onChange={event => updateDraft("time", event.target.value)} /></label></div>}
            <label>{kind === "Nota" ? "Conteúdo da nota" : category === "Alimentação" ? "Refeição e preparo" : category === "Exercício" ? "Treino e objetivo" : "Detalhes"}<textarea className={styles.entityControl} rows={2} value={draft.details ?? ""} onChange={event => updateDraft("details", event.target.value)} placeholder={kind === "Nota" ? `Suas anotações sobre ${category.toLocaleLowerCase("pt-BR")}…` : category === "Alimentação" ? "Ingredientes, porções ou modo de preparo…" : category === "Exercício" ? "Exercícios, séries ou duração…" : "Acrescente o que for importante…"} /></label>
            <div className={styles.hubComposer}><input aria-label={`Título da ${kind === "Evento" ? "criação de evento" : kind.toLocaleLowerCase("pt-BR")}`} value={draft.title ?? ""} onChange={event => updateDraft("title", event.target.value)} placeholder={kind === "Nota" ? `Nota de ${category.toLocaleLowerCase("pt-BR")}` : examples[category]} required /><button type="submit" aria-label={`Criar ${kind.toLocaleLowerCase("pt-BR")}`} disabled={!draft.title?.trim()}><Plus aria-hidden /></button></div>
          </form>
          <p className={styles.hubNotice} role="status">{notice}</p>
        </> : <div className={styles.manualPanel}>
          {panel !== "hub" && <>
          <label className={styles.hubSearch}><Search aria-hidden /><input aria-label="Buscar eventos, tarefas e notas" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Buscar ${panel === "Tarefa" ? "tarefas" : "notas"}`} /></label>
          <div className={styles.manualHeading}><h3>{query ? "Resultados" : "No seu espaço"}</h3><button type="button" onClick={() => { setCreating(!creating); setNotice(""); }}><Plus aria-hidden />Criar novo</button></div>
          {creating && <form className={styles.quickCreate} onSubmit={event => {
            event.preventDefault();
            if (!title.trim()) return;
            setEntries(current => [{ id: `draft-${Date.now()}`, title: title.trim(), kind }, ...current]);
            setTitle(""); setQuery(""); setCreating(false); setNotice(`${kind}: rascunho adicionado à prévia.`);
          }}>
            <label>Tipo<select value={kind} onChange={event => setKind(event.target.value as Kind)} disabled><option>Evento</option><option>Tarefa</option><option>Nota</option></select></label>
            <label>Título<input value={title} onChange={event => setTitle(event.target.value)} placeholder="Dê um nome à sua ideia" required /></label>
            <button type="submit" disabled={!title.trim()}>Criar rascunho</button>
          </form>}
          <p className={styles.hubNotice} role="status">{notice}</p>
          </>}
          {panel === "hub" && <div className={styles.manualHeading}><h3>{query ? "Resultados" : "Eventos, tarefas e notas"}</h3></div>}
          <ul className={styles.hubResults}>{visibleEntries.map(entry => { const Icon = icons[entry.kind]; return <li key={entry.id}><Icon aria-hidden /><span>{entry.title}<small>{entry.kind}{entry.category ? ` · ${entry.category}` : ""}</small></span></li>; })}</ul>
          {visibleEntries.length === 0 && <p className={styles.hubDescription}>Nenhum resultado. Que tal criar algo novo?</p>}
          {panel === "hub" && <label className={styles.hubSearch}><Search aria-hidden /><input aria-label="Pesquisar manualmente" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar eventos, tarefas e notas" /></label>}
        </div>}
        </div>
        {panel === "hub" && <div className={styles.hubDock}>
          {mode === "create" && <>
            <fieldset className={styles.creationToggle} aria-label="Tipo de criação">{(["Tarefa", "Evento", "Nota"] as Kind[]).map(value => { const Icon = icons[value]; return <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setNotice(""); }}><Icon aria-hidden /><span>{value}</span></button>; })}</fieldset>
          </>}
          <fieldset className={styles.hubModes} aria-label="Modo de busca e criação">
            <button type="button" aria-label="Com IA" title="Com IA" aria-pressed={mode === "ai"} onClick={() => selectMode("ai")}><BraidAssistantIcon /></button>
            <button type="button" aria-label="Criar manualmente" title="Criar manualmente" aria-pressed={mode === "create"} onClick={() => selectMode("create")}><CirclePlus aria-hidden /></button>
            <button type="button" aria-label="Pesquisar manualmente" title="Pesquisar manualmente" aria-pressed={mode === "search"} onClick={() => selectMode("search")}><Search aria-hidden /></button>
          </fieldset>
        </div>}
        {panel !== "hub" && <p className={styles.hubFootnote}>Prévia interativa · dados de exemplo · rascunhos só nesta sessão</p>}
      </dialog>
    </>
  );
}
