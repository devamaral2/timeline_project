"use client";

import { ArrowLeft, Clock, Dumbbell, Moon, NotepadText, Plus, Search, Utensils } from "lucide-react";
import { useState } from "react";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { noteExamples, type NotePreview } from "./notes-examples";
import styles from "./notes.module.css";

const filters = ["Todas", "Eventos", "Tarefas", "Soltas"];
const groups = ["Hoje", "Ontem", "Esta semana"];

function SourceIcon({ source }: { source: string }) {
  const Icon = source.includes("Almoço") ? Utensils : source.includes("Academia") ? Dumbbell : source.includes("sono") ? Moon : source.startsWith("Tarefa") ? Clock : NotepadText;
  const color = source.includes("Almoço") ? "var(--food)" : source.includes("Academia") ? "var(--training)" : source.includes("sono") ? "var(--sleep)" : undefined;
  return <Icon aria-hidden size={16} strokeWidth={1.75} style={{ color }} />;
}

function Tags({ tags }: { tags: string[] }) {
  return <div className={styles.tags}>{tags.map(tag => <span key={tag} style={tagColorStyle(tag)}>#{tag}</span>)}</div>;
}

export function NotesPreview() {
  const [filter, setFilter] = useState("Todas");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<NotePreview | null>(null);
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [source, setSource] = useState("Nota solta");
  const [notes, setNotes] = useState(noteExamples);
  const visible = notes.filter(note => (filter === "Todas" || (filter === "Eventos" && note.source.startsWith("Evento")) || (filter === "Tarefas" && note.source.startsWith("Tarefa")) || (filter === "Soltas" && note.source === "Nota solta")) && `${note.title} ${note.body} ${note.tags.join(" ")}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));

  if (creating) return <main id="conteudo" className={styles.detail}>
    <button className={styles.back} onClick={() => setCreating(false)}><ArrowLeft size={18} />Notas</button>
    <form className={styles.create} onSubmit={event => {
      event.preventDefault();
      const lines = content.trim().split("\n");
      if (!lines[0]) return;
      const note = { id: `draft-${Date.now()}`, title: lines[0], body: lines.slice(1).join("\n"), source, group: "Hoje", time: "Agora", tags: tagInput.split(/[,\s]+/).map(tag => tag.replace(/^#/, "")).filter(Boolean) };
      setNotes(current => [note, ...current]); setCreating(false); setContent(""); setTagInput(""); setSource("Nota solta"); setSelected(note);
    }}>
      <h1>Nota</h1>
      <textarea aria-label="Conteúdo da nota" placeholder={"Fim de semana\n\nSuas anotações…"} value={content} onChange={event => setContent(event.target.value)} required />
      <p>A primeira linha vira o título.</p>
      <label>Ligada a<select value={source} onChange={event => setSource(event.target.value)}><option value="Nota solta">Evento ou tarefa · opcional</option>{noteExamples.filter(note => note.source !== "Nota solta").map(note => <option key={note.id}>{note.source}</option>)}</select></label>
      <label>Tags<input placeholder="#pessoal" value={tagInput} onChange={event => setTagInput(event.target.value)} /></label>
      <button className={styles.primary} type="submit" disabled={!content.trim()}>Criar nota</button>
      <p role="status">Prévia · rascunho apenas nesta sessão</p>
    </form>
  </main>;

  if (selected) return <main id="conteudo" className={styles.detail}>
    <button className={styles.back} onClick={() => setSelected(null)}><ArrowLeft size={18} />Notas</button>
    <header><h1>{selected.title}</h1><div className={styles.source}><SourceIcon source={selected.source} />{selected.source}</div><Tags tags={selected.tags} /><p className={styles.metadata}>Criada {selected.group === "Hoje" ? "hoje" : selected.group === "Ontem" ? "ontem" : "esta semana"}, {selected.time}</p></header>
    <article className={styles.body}>{selected.source.includes("Academia") ? <>
      <p className={styles.metadata}>Calorias gastas</p><div className={styles.metrics}><span>415 <small>kcal</small></span><span>1 <small>h</small></span></div>
      <h2>Treinos</h2><div className={styles.workout}><div><h3>Esteira</h3><p>20 min · 3,2 km · 6′15″/km</p></div><span>190 kcal</span></div>
      <details className={styles.workoutDetails}><summary><span>Musculação<small>40 min · 3 exercícios · 10 séries</small></span><span>225 kcal</span></summary><p>Supino, crucifixo e tríceps na polia.</p></details>
    </> : (selected.id === "4" ? "Começar pelo problema do cliente, não pela solução. Eles reclamaram duas vezes do prazo da primeira fase, e é isso que a proposta precisa resolver primeiro." : selected.body).split("\n").map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
      {selected.id === "4" && <><h2>Pontos para a reunião</h2><ul><li>Mostrar o cronograma da segunda fase numa página só.</li><li>Separar o preço da fase 2 do suporte mensal.</li><li>Levar os números de uso de agosto.</li></ul><h2>Dúvida</h2><p>O desconto de 10% vale para o contrato anual inteiro ou só para o primeiro ano?</p></>}
    </article>
    <p className={styles.metadata}>Prévia · dados de exemplo</p>
  </main>;

  return <main id="conteudo" className={styles.main}>
    <header className={styles.heading}><div><p>{notes.length} notas</p><h1>Notas</h1></div><div className={styles.actions}><button aria-label="Buscar notas" aria-expanded={searching} onClick={() => setSearching(!searching)}><Search size={20} /></button><button className={styles.primary} onClick={() => setCreating(true)}><Plus size={18} />Nova nota</button></div></header>
    {searching && <input className={styles.search} autoFocus aria-label="Buscar notas" placeholder="Buscar notas" value={query} onChange={event => setQuery(event.target.value)} />}
    <div className={styles.filters} role="group" aria-label="Filtrar notas">{filters.map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <div className={styles.groups}>{groups.map(group => {
      const items = visible.filter(note => note.group === group);
      return items.length > 0 && <section key={group} aria-label={group}><h2>{group}<span>{items.length}</span></h2><div className={styles.grid}>{items.map(note => <button className={styles.card} key={note.id} onClick={() => setSelected(note)}><div className={styles.cardMeta}><span className={styles.source}><SourceIcon source={note.source} /><span>{note.source}</span></span><time>{note.time}</time></div><h3>{note.title}</h3><p>{note.body}</p><Tags tags={note.tags} /></button>)}</div></section>;
    })}</div>
    {visible.length === 0 && <p className={styles.metadata}>Nenhuma nota encontrada.</p>}
    <p className={styles.footnote}>Prévia · dados de exemplo · rascunhos apenas nesta sessão</p>
  </main>;
}
