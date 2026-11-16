"use client";

import { ArrowLeft, CalendarDays, Check, ChevronDown, FileText, Plus, Search, SquareCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { creatableItemTypes, ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { AgentChatPanel, agentEntityHref, useAgendaChat } from "@/components/hub/agent-chat-panel";
import { EXAMPLE_TODAY, exampleEventsOn, type TaskStatus } from "@/components/agenda/agenda-examples";
import { CalendarPicker, type DateField, EventScheduleFields } from "@/components/new-item/event-schedule-fields";
import { NotificationFeed, useNotificationFeed } from "./notification-bell";
import { type Box, boxOf, canFly, FLIGHT_BACK_MS, FLIGHT_OUT_MS, flightKeyframes, type HermesDockDetail, hermesDockEvent, hermesMarkIn } from "@/components/ui/hermes-flight";
import { HermesBot, useHermesBotState } from "@/components/ui/hermes-bot";
import { SettingsView } from "./settings-view";
import styles from "./shell.module.css";
import type { HubCommandId } from "@/components/hub/hub-commands";
import { type FreeWindow, type HubOpenDetail, hubOpenEvent } from "@/components/hub/hub-events";
import { dayKeyOf } from "@repo/timeline";
import { useViewMode } from "@/lib/events/view-mode";
import { type SectionId, useSectionMenu } from "@/lib/navigation/section-menu";
import { SectionMenu } from "./section-menu";
import { TaskStatusIcon, taskStatuses } from "@/components/agenda/task-controls";

type Kind = "Evento" | "Tarefa" | "Nota";
type Picker = "eventType" | "status" | "priority" | DateField;
const pickerTitles: Record<Picker, string> = { eventType: "Tipo de evento", status: "Status", priority: "Prioridade", startDate: "Início", endDate: "Término" };
type Category = "Rotina" | "Alimentação" | "Exercício";
type DraftPriority = "low" | "medium" | "high" | "urgent";
type EventType = (typeof creatableItemTypes)[number];
type Entry = { id: string; title: string; kind: Kind; category?: Category; draft?: Record<string, string> };
const draftPriorities: Record<DraftPriority, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };
const draftPriorityOrder: DraftPriority[] = ["urgent", "high", "medium", "low"];
const eventDetailCopy: Record<EventType, { label: string; placeholder: string }> = {
  common: { label: "Detalhes", placeholder: "Acrescente o que for importante…" },
  meal: { label: "Alimentos e preparo", placeholder: "Ingredientes, quantidades ou modo de preparo…" },
  training: { label: "Treino e objetivo", placeholder: "Exercícios, séries ou objetivo do treino…" },
  sleep: { label: "Observações do sono", placeholder: "Acrescente algo importante sobre este período…" },
};
const initialEntries: Entry[] = [
  ...exampleEventsOn(EXAMPLE_TODAY).map((event, index) => ({ id: `event-${index}`, title: event.name, kind: "Evento" as const })),
  ...exampleEventsOn(EXAMPLE_TODAY).flatMap(event => event.task ? [{ id: event.task.id, title: event.name, kind: "Tarefa" as const }] : []),
  { id: "note-1", title: "Ideias para a proposta", kind: "Nota" },
];
const icons = { Evento: CalendarDays, Tarefa: SquareCheck, Nota: FileText };

function DraftPriorityIcon({ priority }: { priority: DraftPriority }) {
  if (priority === "urgent") return <span className={styles.entityPriorityIcon} data-priority={priority} aria-hidden>
    <svg aria-hidden viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="2" fill="currentColor" opacity=".18" /><path d="M8 5v4M8 11.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  </span>;
  const activeBars = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return <span className={styles.entityPriorityIcon} data-priority={priority} aria-hidden>
    <svg aria-hidden viewBox="0 0 16 16" fill="none">
      <path d="M3 12V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 12V6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={activeBars >= 2 ? 1 : .2} />
      <path d="M13 12V3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={activeBars === 3 ? 1 : .2} />
    </svg>
  </span>;
}

/**
 * O voo do botão do Hermes entre a barra e o ícone de status de um campo:
 * `out`/`back` abrem e fecham o chat (na barra, o X de fechar fica no lugar do
 * botão); `dock`/`undock` acompanham a entrada e a saída de um detalhe, onde a
 * barra some e o campo do registro fica no lugar dela (`late`: o registro
 * demorou a carregar e a barra já tinha saído; só o círculo voa).
 */
type Flight = { kind: "out" } | { kind: "back"; mark: Box } | { kind: "dock"; dock: HTMLElement; late: boolean } | { kind: "undock"; mark: Box };

/** O que o cabeçalho do desktop precisa do painel: abri-lo. */
export interface HubHandle { open: () => void }

/**
 * A barra inferior do celular (a dock das três telas e, separado, o círculo do
 * chat) e o painel "Buscar e criar". O painel é o mesmo
 * nos dois tamanhos: no celular abre pela barra, como folha; no desktop, pelo
 * campo do cabeçalho (`hubRef`) ou por Ctrl/⌘ K, como diálogo centrado.
 */
/** A tela "Notificações" do painel: a mesma lista do sino, sem entregar avisos (quem entrega é o sino montado). */
function NotificationsView({ userId }: { userId: string }) {
  const state = useNotificationFeed();
  return <section className={styles.notificationPanel} data-inline="true" aria-label="Notificações"><NotificationFeed userId={userId} state={state} /></section>;
}

export function MobileNavigation({ userId, hubRef, onHubOpenChange, darkMode = false, onThemeToggle = () => {} }: { userId?: string; hubRef?: RefObject<HubHandle | null>; onHubOpenChange?: (open: boolean) => void; darkMode?: boolean; onThemeToggle?: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const notesHref = userId ? `/${userId}/notas` : "/mockups/eventos/notas";
  const onNotes = notesHref !== null && (pathname === notesHref || pathname.startsWith(`${notesHref}/`));
  const tasksHref = userId ? `/${userId}/tarefas` : null;
  const onTasks = tasksHref !== null && (pathname === tasksHref || pathname.startsWith(`${tasksHref}/`));
  // A aba da Agenda fica marcada em qualquer rota que não seja Notas nem Tarefas.
  const onAgenda = !onNotes && !onTasks;
  // Menu de opções: aberto por tocar na aba já selecionada; a aba que abriu recebe o foco ao fechar com Esc.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTabRef = useRef<HTMLElement | null>(null);
  const menuId = useId();
  const section: SectionId = onTasks ? "tasks" : onNotes ? "notes" : "agenda";
  const sectionTitle = onTasks ? "Tarefas" : onNotes ? "Artefatos" : "Agenda";
  const sectionMenu = useSectionMenu(section);
  // De que lado a pílula sai na frente ao trocar de tela.
  const navIndex = onTasks ? 0 : onNotes ? 2 : 1;
  const lastIndexRef = useRef(navIndex);
  const navDirRef = useRef<"l" | "r" | undefined>(undefined);
  if (lastIndexRef.current !== navIndex) {
    navDirRef.current = navIndex > lastIndexRef.current ? "r" : "l";
    lastIndexRef.current = navIndex;
  }
  const agendaChat = useAgendaChat({ live: Boolean(userId) });
  // O robô da barra acompanha o chat mesmo com o painel fechado: pensa enquanto
  // a IA responde e mostra o desfecho (✓ ou !) por um instante.
  const lastMessageRole = (agendaChat.chat.messages ?? []).at(-1)?.role;
  const botState = useHermesBotState({ pending: Boolean(agendaChat.chat.pending), failed: lastMessageRole === "error" });
  // A cor do modo pinta a aba selecionada nas três telas.
  const viewMode = useViewMode();
  const startNewConversationRef = useRef(agendaChat.chat.startNewConversation);
  startNewConversationRef.current = agendaChat.chat.startNewConversation;
  const [panel, setPanel] = useState<"hub" | "Tarefa" | "Nota" | null>(null);
  // O chat e a porta do painel; criar e pesquisar abrem pelos comandos "/" dele.
  const [hubView, setHubView] = useState<"chat" | "create" | "search" | "notifications" | "settings">("chat");
  const [expanded, setExpanded] = useState(false);
  // O chat acabou de abrir: o campo ganha o foco e o microfone já liga. Vale até
  // a pessoa sair do chat (um comando "/") ou fechar o painel.
  const [chatJustOpened, setChatJustOpened] = useState(false);
  // A janela livre que abriu o chat: fica anexada ao campo ate ser enviada ou tirada.
  const [freeWindow, setFreeWindow] = useState<FreeWindow | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("Tarefa");
  const [category, setCategory] = useState<Category>("Rotina");
  const [eventType, setEventType] = useState<EventType>("common");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState(initialEntries);
  const [notice, setNotice] = useState("");
  const [formPicker, setFormPicker] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [activePicker, setActivePicker] = useState<Picker | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef<Flight | null>(null);
  flightRef.current = flight;
  const commandRef = useRef<HTMLSpanElement>(null);
  const flyerRef = useRef<HTMLSpanElement>(null);
  // A caixa do botão enquanto a barra está à vista, e se estava à vista na tela anterior.
  const commandBoxRef = useRef<Box | null>(null);
  const navShownRef = useRef(false);
  const navLeftAtRef = useRef(0);
  const leftMarkRef = useRef<{ mark: Box; at: number } | null>(null);
  const dialogId = useId();
  const titleId = useId();
  const draftKey = kind === "Evento" ? `${kind}:${eventType}` : `${kind}:${category}`;
  const draft = drafts[draftKey] ?? {};
  const eventVisual = visualForItemType(eventType);
  const selectedPriority = draft.priority && draft.priority in draftPriorities ? draft.priority as DraftPriority : "medium";
  const selectedStatus = draft.status && draft.status in taskStatuses ? draft.status as TaskStatus : "todo";
  function updateDraft(field: string, value: string) {
    setDrafts(current => ({ ...current, [draftKey]: { ...current[draftKey], [field]: value } }));
  }
  function runCommand(command: HubCommandId, argument: string) {
    setActivePicker(null);
    setNotice("");
    setChatJustOpened(false);
    if (command === "search") {
      setQuery(argument);
      setHubView("search");
      return;
    }
    if (command === "notifications" || command === "settings") {
      setHubView(command);
      return;
    }
    // Logado, criar é uma rota: `/evento` abre o formulário de evento e `/nota`, o de artefato, já com o nome.
    if (userId) {
      openCreation(command === "event" ? "eventos/novo" : "notas/nova", argument);
      return;
    }
    const next: Kind = command === "event" ? "Evento" : "Nota";
    setFormPicker(false);
    setKind(next);
    setCategory("Rotina");
    // `/evento comprar pão` ja chega com o nome preenchido.
    if (argument) {
      const key = next === "Evento" ? `${next}:${eventType}` : `${next}:Rotina`;
      setDrafts(current => ({ ...current, [key]: { ...current[key], title: argument } }));
    }
    setHubView("create");
  }
  function backToChat() {
    setActivePicker(null);
    setNotice("");
    setHubView("chat");
  }

  // A caixa do botão em repouso: durante um voo ele está escondido ou em transição.
  function rememberCommandBox() {
    if (!flightRef.current) commandBoxRef.current = boxOf(commandRef.current) ?? commandBoxRef.current;
  }

  function openPanel(next: "hub" | "Tarefa" | "Nota") {
    rememberCommandBox();
    setMenuOpen(false);
    setPanel(next);
    setQuery("");
    setCreating(false);
    setActivePicker(null);
    setNotice("");
    if (next === "hub") { setHubView("chat"); setExpanded(false); setChatJustOpened(true); }
    if (next !== "hub") setKind(next);
    // No celular o chat nao e modal: a barra inferior fica viva por baixo, e
    // tocar num destino navega e fecha o chat (ali ele nao tem botao de fechar).
    const desktop = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 721px)").matches;
    const dialog = dialogRef.current;
    if (next === "hub" && !desktop && typeof dialog?.show === "function") dialog.show();
    else dialog?.showModal();
    // O botão sai da barra e pousa como o status do campo; o X fica no lugar dele.
    if (next === "hub" && canFly()) setFlight({ kind: "out" });
  }

  function closePanel() {
    const dialog = dialogRef.current;
    if (!dialog?.open || flightRef.current?.kind === "back") return;
    rememberCommandBox();
    // Com o chat à vista, o ícone de status volta para a barra antes de o painel fechar.
    const mark = panel === "hub" && hubView === "chat" && canFly() ? boxOf(hermesMarkIn(dialog)) : null;
    if (mark) setFlight({ kind: "back", mark });
    else dialog.close();
  }
  const closePanelRef = useRef(closePanel);
  closePanelRef.current = closePanel;

  // Um voo que começa no meio da volta (tocar num registro do chat leva ao detalhe, e o campo dele chama o
  // botão) cancela o temporizador que fecharia o painel: a volta termina ali, com o painel fechado.
  const landBack = useCallback(() => {
    if (flightRef.current?.kind !== "back") return;
    setPanel(null);
    setFreeWindow(null);
    if (dialogRef.current?.open) dialogRef.current.close();
  }, []);

  // Tocar na aba selecionada abre ou fecha o menu de opções e não navega; numa aba não selecionada, só navega.
  // Com o chat aberto, o toque só o fecha.
  function tabClick(event: ReactMouseEvent<HTMLAnchorElement>, selected: boolean) {
    const chatOpen = panel !== null;
    closePanel();
    if (!selected) {
      setMenuOpen(false);
      return;
    }
    event.preventDefault();
    if (chatOpen) return;
    menuTabRef.current = event.currentTarget;
    setMenuOpen(current => !current);
  }

  // Esc fecha o menu e devolve o foco à aba que o abriu.
  function onNavKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !menuOpen) return;
    event.preventDefault();
    setMenuOpen(false);
    menuTabRef.current?.focus();
  }

  // Criar evento e criar artefato são rotas (`/eventos/novo`, `/notas/nova`), com o mesmo formulário da edição:
  // o painel fecha e a rota abre com o nome, se houver.
  function openCreation(route: "eventos/novo" | "notas/nova", name: string) {
    if (!userId) return;
    closePanel();
    router.push(`/${userId}/${route}${name ? `?nome=${encodeURIComponent(name)}` : ""}`);
  }

  // O cabeçalho e o atalho de teclado abrem o painel sem conhecer o estado dele:
  // a referência guarda sempre a versão atual de `openPanel`.
  const openHubRef = useRef(() => {});
  openHubRef.current = () => openPanel("hub");

  useEffect(() => {
    if (!hubRef) return;
    hubRef.current = { open: () => openHubRef.current() };
    return () => { hubRef.current = null; };
  }, [hubRef]);

  useEffect(() => { onHubOpenChange?.(panel === "hub"); }, [panel, onHubOpenChange]);

  // Trocar de tela fecha o menu de opções.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o caminho é o gatilho.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // O voo: um círculo solto sobre o botão da barra faz o caminho até o ícone de
  // status (ou de volta), e o ícone de verdade só aparece no pouso.
  useLayoutEffect(() => {
    if (!flight) return;
    const forward = flight.kind === "out" || flight.kind === "dock";
    const button = commandBoxRef.current ?? boxOf(commandRef.current);
    const mark = flight.kind === "out" ? boxOf(hermesMarkIn(dialogRef.current)) : flight.kind === "dock" ? boxOf(hermesMarkIn(flight.dock)) : flight.mark;
    const dock = flight.kind === "dock" ? flight.dock : null;
    const flyer = flyerRef.current;
    const duration = forward ? FLIGHT_OUT_MS : FLIGHT_BACK_MS;
    let animation: Animation | undefined;
    if (flyer && button && mark && typeof flyer.animate === "function") {
      Object.assign(flyer.style, { left: `${button.left}px`, top: `${button.top}px`, width: `${button.width}px`, height: `${button.height}px`, visibility: "visible" });
      animation = flyer.animate(flightKeyframes(button, mark, forward), { duration, easing: "linear", fill: "both" });
    }
    // Só depois de medir: a subida do campo desloca o que está dentro dele.
    if (dock) dock.dataset.hermesFlight = "dock";
    const timer = window.setTimeout(() => {
      if (flight.kind === "back") {
        setPanel(null);
        setFreeWindow(null);
        if (dialogRef.current?.open) dialogRef.current.close();
      }
      setFlight(null);
    }, duration);
    return () => {
      window.clearTimeout(timer);
      animation?.cancel();
      if (dock) delete dock.dataset.hermesFlight;
    };
  }, [flight]);

  // Entrar num detalhe: o campo do registro avisa que chegou e o botão voa até
  // ele; ao sair, guarda de onde o ícone parte para a volta.
  useEffect(() => {
    function onDock(event: Event) {
      const detail = (event as CustomEvent<HermesDockDetail>).detail;
      if ("dock" in detail) {
        leftMarkRef.current = null;
        // O detalhe esconde a barra já ao carregar; o campo pode chegar um instante depois.
        const late = !navShownRef.current;
        landBack();
        if ((!late || performance.now() - navLeftAtRef.current < 600) && canFly()) setFlight({ kind: "dock", dock: detail.dock, late });
        // De um detalhe para outro não há voo.
        navShownRef.current = false;
        navLeftAtRef.current = 0;
      } else if (detail.left) {
        leftMarkRef.current = { mark: detail.left, at: performance.now() };
      }
    }
    window.addEventListener(hermesDockEvent, onDock);
    return () => window.removeEventListener(hermesDockEvent, onDock);
  }, [landBack]);

  // A cada tela: se a barra voltou logo depois de um detalhe sair, o ícone volta para ela.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o caminho é o gatilho.
  useLayoutEffect(() => {
    const box = boxOf(commandRef.current);
    const left = leftMarkRef.current;
    leftMarkRef.current = null;
    if (box && !navShownRef.current && left && performance.now() - left.at < 1000 && canFly()) { landBack(); setFlight({ kind: "undock", mark: left.mark }); }
    if (box) commandBoxRef.current = box;
    else if (navShownRef.current) navLeftAtRef.current = performance.now();
    navShownRef.current = box !== null;
  }, [pathname, landBack]);

  // O chat abre pronto para digitar (e já ouvindo), no desktop e no celular. Ao
  // voltar de um comando para o chat, só o desktop refoca: no celular o teclado
  // subiria sem a pessoa ter pedido. Com a sessão chegando depois do painel, o
  // campo só pode receber o foco quando deixa de estar desabilitado.
  useEffect(() => {
    if (!agendaChat.chat.ready) return;
    if (panel !== "hub" || hubView !== "chat" || !(chatJustOpened || window.matchMedia("(min-width: 721px)").matches)) return;
    dialogRef.current?.querySelector<HTMLElement>('[aria-label="Mensagem para a IA"]')?.focus({ preventScroll: true });
  }, [panel, hubView, chatJustOpened, agendaChat.chat.ready]);

  // Uma tela pede o painel (a janela livre da agenda, por exemplo).
  useEffect(() => {
    function onRequest(event: Event) {
      const requested = (event as CustomEvent<HubOpenDetail>).detail?.freeWindow ?? null;
      // Planejar um tempo livre (+) sempre começa uma conversa nova, nunca retoma a última.
      if (requested) startNewConversationRef.current();
      setFreeWindow(requested);
      if (!dialogRef.current?.open) openHubRef.current();
    }
    window.addEventListener(hubOpenEvent, onRequest);
    return () => window.removeEventListener(hubOpenEvent, onRequest);
  }, []);

  // Ctrl/⌘ K abre o painel de qualquer tela e fecha se já estiver aberto.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (dialogRef.current?.open) closePanelRef.current();
      else openHubRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleEntries = entries.filter(entry => (panel === "hub" || entry.kind === panel) && entry.title.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));

  return (
    <>
      <div className={styles.bottomFade} aria-hidden />
      <button type="button" className={styles.navScrim} data-open={menuOpen ? "" : undefined} aria-label="Fechar menu" tabIndex={-1} onClick={() => setMenuOpen(false)} />
      <nav className={styles.bottomNav} aria-label="Navegação inferior" onKeyDown={onNavKeyDown} data-list-mode={viewMode.id} data-menu-open={menuOpen ? "" : undefined} data-dir={navDirRef.current} style={{ "--nav-index": navIndex } as CSSProperties} data-hub-open={panel === "hub" && flight?.kind !== "back" ? "true" : undefined} data-flight={flight?.kind === "dock" && flight.late ? undefined : flight?.kind}>
        <div className={styles.navDock}>
        <SectionMenu id={menuId} section={section} title={sectionTitle} open={menuOpen} onClose={() => setMenuOpen(false)} structuredSettings={Boolean(userId)} />
        <div className={styles.navTabs}>
          {tasksHref ? (
            <Link href={tasksHref} aria-label="Tarefas" aria-current={onTasks ? "page" : undefined} aria-expanded={onTasks ? menuOpen : undefined} aria-controls={onTasks ? menuId : undefined} data-no-motion={onTasks ? "" : undefined} onClick={event => tabClick(event, onTasks)}><SquareCheck aria-hidden /><i className={styles.navDot} data-on={onTasks && sectionMenu?.filtered ? "" : undefined} aria-hidden /></Link>
          ) : (
            <button type="button" aria-label="Tarefas" onClick={() => openPanel("Tarefa")} aria-haspopup="dialog" aria-expanded={panel === "Tarefa"} aria-controls={dialogId}><SquareCheck aria-hidden /></button>
          )}
          <Link href={userId ? `/${userId}` : "/mockups/eventos"} aria-label="Agenda" aria-current={onAgenda ? "page" : undefined} aria-expanded={onAgenda ? menuOpen : undefined} aria-controls={onAgenda ? menuId : undefined} data-no-motion={onAgenda ? "" : undefined} onClick={event => tabClick(event, onAgenda)}><CalendarDays aria-hidden /><i className={styles.navDot} data-on={onAgenda && sectionMenu?.filtered ? "" : undefined} aria-hidden /></Link>
          {notesHref ? (
            <Link href={notesHref} aria-label="Artefatos" aria-current={onNotes ? "page" : undefined} aria-expanded={onNotes ? menuOpen : undefined} aria-controls={onNotes ? menuId : undefined} data-no-motion={onNotes ? "" : undefined} onClick={event => tabClick(event, onNotes)}><FileText aria-hidden /><i className={styles.navDot} data-on={onNotes && sectionMenu?.filtered ? "" : undefined} aria-hidden /></Link>
          ) : (
            <button type="button" aria-label="Artefatos" onClick={() => openPanel("Nota")} aria-haspopup="dialog" aria-expanded={panel === "Nota"} aria-controls={dialogId}><FileText aria-hidden /></button>
          )}
        </div>
        </div>
        {/* O chat fica fora da dock: um círculo próprio na ponta. O voo mede o miolo (52 px), não o aro. */}
        <button type="button" className={styles.commandButton} data-close={panel === "hub" ? "true" : undefined} onClick={() => panel === "hub" ? closePanel() : openPanel("hub")} aria-haspopup="dialog" aria-expanded={panel === "hub"} aria-controls={dialogId} aria-label={panel === "hub" ? "Fechar chat com IA" : "Buscar e criar"}><span ref={commandRef} className={styles.commandCore}>{panel === "hub" ? <X aria-hidden /> : <HermesBot state={botState} className={styles.commandBot} />}</span></button>
      </nav>
      {flight ? <span ref={flyerRef} className={styles.hermesFlyer} aria-hidden><HermesBot state={botState} className={styles.flyerBot} /></span> : null}
      <dialog ref={dialogRef} id={dialogId} aria-labelledby={panel === "hub" ? undefined : titleId} aria-label={panel === "hub" ? "Buscar e criar" : undefined} className={styles.sectionMenu} onClose={() => { setPanel(null); setFreeWindow(null); setChatJustOpened(false); setFlight(current => current?.kind === "out" || current?.kind === "back" ? null : current); }}
        data-flight={flight?.kind === "out" || flight?.kind === "back" ? flight.kind : undefined}
        data-hub-view={panel === "hub" ? hubView : undefined} data-expanded={panel === "hub" && hubView === "chat" && expanded ? "true" : undefined}
        onPointerDown={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) { event.preventDefault(); closePanel(); }
        }}>
        <div className={styles.sheetHandle} aria-hidden />
        {panel !== "hub" && <div className={styles.sectionMenuHeading}>
          <h2 id={titleId}>{panel === "Tarefa" ? "Tarefas" : "Notas"}</h2>
          <button type="button" onClick={closePanel} aria-label="Fechar painel"><X aria-hidden /></button>
        </div>}
        {panel === "hub" && hubView === "chat" ? <AgentChatPanel {...agendaChat} expanded={expanded} onToggleExpanded={() => setExpanded(current => !current)} listenOnOpen={chatJustOpened} onCommand={runCommand} onClose={closePanel} entityHref={userId ? entity => agentEntityHref(userId, entity) : undefined} freeWindow={freeWindow} onClearFreeWindow={() => setFreeWindow(null)} todayKey={userId ? dayKeyOf(new Date()) : EXAMPLE_TODAY} /> : <>
        {panel === "hub" && !activePicker && !formPicker && <div className={styles.hubHeader}>
          <button type="button" className={styles.hubBack} onClick={backToChat} aria-label="Voltar para o chat"><ArrowLeft aria-hidden /></button>
          {hubView === "notifications" || hubView === "settings" ? null
            : hubView === "create" ? <fieldset className={styles.creationToggle} aria-label="Tipo de criação">{(["Evento", "Nota"] as Kind[]).map(value => { const Icon = icons[value]; return <button type="button" key={value} aria-pressed={kind === value} onClick={() => { if (userId) { openCreation(value === "Evento" ? "eventos/novo" : "notas/nova", ""); return; } setKind(value); setActivePicker(null); setNotice(""); setFormPicker(false); }}><Icon aria-hidden /><span>{value}</span></button>; })}</fieldset>
            : <label className={styles.hubSearch}><Search aria-hidden /><input aria-label="Pesquisar eventos, tarefas e artefatos" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar eventos, tarefas e artefatos" autoFocus /></label>}
        </div>}
        <div className={styles.hubContent}>
        {panel === "hub" && hubView === "create" && activePicker ? <div className={styles.pickerView}>
          <div className={styles.pickerHeader}>
            <button type="button" className={styles.pickerBack} onClick={() => setActivePicker(null)} aria-label="Voltar"><ArrowLeft aria-hidden /></button>
            <h3>{pickerTitles[activePicker]}</h3>
          </div>
          {activePicker === "startDate" || activePicker === "endDate" ? <div className={styles.pickerOptions}>
            <CalendarPicker value={draft[activePicker] ?? EXAMPLE_TODAY} onChange={value => updateDraft(activePicker, value)} onClose={() => setActivePicker(null)} />
          </div> : <div className={styles.pickerOptions} role="listbox" aria-label={pickerTitles[activePicker]}>
            {activePicker === "eventType" && creatableItemTypes.map(type => {
              const visual = visualForItemType(type);
              return <button type="button" role="option" aria-selected={type === eventType} key={type} className={styles.pickerOption} onClick={() => { setEventType(type); setActivePicker(null); }}>
                <span className={styles.entityTypeIcon} data-event-type={type}><visual.Icon aria-hidden strokeWidth={ICON_STROKE_WIDTH} /></span>
                <span>{visual.label}</span>
                {type === eventType ? <Check aria-hidden /> : null}
              </button>;
            })}
            {activePicker === "status" && (Object.keys(taskStatuses) as TaskStatus[]).map(status => <button type="button" role="option" aria-selected={status === selectedStatus} key={status} className={styles.pickerOption} onClick={() => { updateDraft("status", status); setActivePicker(null); }}>
              <TaskStatusIcon status={status} />
              <span>{taskStatuses[status].label}</span>
              {status === selectedStatus ? <Check aria-hidden /> : null}
            </button>)}
            {activePicker === "priority" && draftPriorityOrder.map(priority => <button type="button" role="option" aria-selected={priority === selectedPriority} key={priority} className={styles.pickerOption} onClick={() => { updateDraft("priority", priority); setActivePicker(null); }}>
              <DraftPriorityIcon priority={priority} />
              <span>{draftPriorities[priority]}</span>
              {priority === selectedPriority ? <Check aria-hidden /> : null}
            </button>)}
          </div>}
        </div> : panel === "hub" && hubView === "notifications" ? (userId ? <NotificationsView userId={userId} /> : <p className={styles.notificationEmpty}>Entre na sua conta para ver os avisos.</p>)
          : panel === "hub" && hubView === "settings" ? <SettingsView darkMode={darkMode} onThemeToggle={onThemeToggle} onSignedOut={() => { closePanel(); router.replace("/"); }} />
          : panel === "hub" && hubView === "create" ? <div className={styles.entityForm}>
            {kind === "Evento" ? <div className={styles.entityEventHeading}>
              <span className={styles.entityEventTypeName}>{eventVisual.label}</span>
              <div className={styles.entityEventTitleRow}>
                <fieldset className={styles.entityTypeSelect}>
                  <button type="button" className={styles.entityTypeButton} aria-label={`Tipo do evento: ${eventVisual.label}`} aria-haspopup="dialog" aria-expanded={activePicker === "eventType"} onClick={() => setActivePicker("eventType")}>
                    <span className={styles.entityTypeIcon} data-event-type={eventType}><eventVisual.Icon aria-hidden strokeWidth={ICON_STROKE_WIDTH} /></span>
                    <ChevronDown aria-hidden />
                  </button>
                </fieldset>
                <input className={styles.entityEventNameInput} aria-label="Nome do evento" value={draft.title ?? ""} onChange={event => updateDraft("title", event.target.value)} placeholder="Nome do evento" />
              </div>
            </div> : <div className={styles.entityHeading}><span>{(() => { const Icon = icons[kind]; return <Icon aria-hidden />; })()}</span><div><input className={styles.entityNameInput} aria-label={`Nome da ${kind.toLocaleLowerCase("pt-BR")}`} value={draft.title ?? ""} onChange={event => updateDraft("title", event.target.value)} placeholder={`Nome da ${kind.toLocaleLowerCase("pt-BR")}`} /><p>{category}</p></div></div>}
            {kind === "Tarefa" && <div className={styles.entitySelectors}>
              <fieldset className={styles.entitySelect}>
                <span className={styles.entitySelectLabel}>Status</span>
                <button type="button" className={styles.entitySelectButton} aria-label={`Status: ${taskStatuses[selectedStatus].label}`} aria-haspopup="dialog" aria-expanded={activePicker === "status"} onClick={() => setActivePicker("status")}>
                  <TaskStatusIcon status={selectedStatus} />
                  <span>{taskStatuses[selectedStatus].label}</span>
                  <ChevronDown aria-hidden />
                </button>
              </fieldset>
              <fieldset className={styles.entitySelect}>
                <span className={styles.entitySelectLabel}>Prioridade</span>
                <button type="button" className={styles.entitySelectButton} aria-label={`Prioridade: ${draftPriorities[selectedPriority]}`} aria-haspopup="dialog" aria-expanded={activePicker === "priority"} onClick={() => setActivePicker("priority")}>
                  <DraftPriorityIcon priority={selectedPriority} />
                  <span>{draftPriorities[selectedPriority]}</span>
                  <ChevronDown aria-hidden />
                </button>
              </fieldset>
            </div>}
            {kind === "Evento" && <>
              <EventScheduleFields
                key={eventType}
                startDate={draft.startDate ?? EXAMPLE_TODAY}
                startTime={draft.startTime ?? "09:00"}
                endDate={draft.endDate ?? EXAMPLE_TODAY}
                endTime={draft.endTime ?? "10:00"}
                activeField={activePicker === "startDate" || activePicker === "endDate" ? activePicker : null}
                onChange={updateDraft}
                onOpenCalendar={field => setActivePicker(field)}
              />
              {eventType === "meal" ? <div className={styles.entityFields}>
                <label>Refeição<input value={draft.mealName ?? ""} onChange={event => updateDraft("mealName", event.target.value)} placeholder="Ex.: Café da manhã" /></label>
                <label>Porção<input value={draft.portion ?? ""} onChange={event => updateDraft("portion", event.target.value)} placeholder="Ex.: 1 prato" /></label>
              </div> : null}
              {eventType === "training" ? <div className={styles.entityFields}>
                <label>Modalidade<select value={draft.workout ?? "free"} onChange={event => updateDraft("workout", event.target.value)}><option value="free">Livre</option><option value="walking">Caminhada</option><option value="running">Corrida</option><option value="treadmill">Esteira</option><option value="weightlifting">Musculação</option></select></label>
                <label>Duração (min)<input type="number" min="0" inputMode="numeric" value={draft.duration ?? ""} onChange={event => updateDraft("duration", event.target.value)} placeholder="60" /></label>
              </div> : null}
              {eventType === "sleep" ? <div className={styles.entityFields}>
                <label>Tempo de sono (min)<input type="number" min="0" inputMode="numeric" value={draft.sleepMinutes ?? ""} onChange={event => updateDraft("sleepMinutes", event.target.value)} placeholder="480" /></label>
                <label>Qualidade (0–100)<input type="number" min="0" max="100" inputMode="numeric" value={draft.sleepScore ?? ""} onChange={event => updateDraft("sleepScore", event.target.value)} placeholder="80" /></label>
              </div> : null}
            </>}
            <label>{kind === "Evento" ? eventDetailCopy[eventType].label : kind === "Nota" ? "Conteúdo da nota" : category === "Alimentação" ? "Refeição e preparo" : category === "Exercício" ? "Treino e objetivo" : "Detalhes"}<textarea className={styles.entityControl} rows={2} value={draft.details ?? ""} onChange={event => updateDraft("details", event.target.value)} placeholder={kind === "Evento" ? eventDetailCopy[eventType].placeholder : kind === "Nota" ? `Suas anotações sobre ${category.toLocaleLowerCase("pt-BR")}…` : category === "Alimentação" ? "Ingredientes, porções ou modo de preparo…" : category === "Exercício" ? "Exercícios, séries ou duração…" : "Acrescente o que for importante…"} /></label>
          </div> : <div className={styles.manualPanel}>
          {panel !== "hub" && <>
          <label className={styles.hubSearch}><Search aria-hidden /><input aria-label="Buscar eventos, tarefas e artefatos" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Buscar ${panel === "Tarefa" ? "tarefas" : "notas"}`} /></label>
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
          {panel === "hub" && <div className={styles.manualHeading}><h3>{query ? "Resultados" : "No seu espaço"}</h3></div>}
          <ul className={styles.hubResults}>{visibleEntries.map(entry => { const Icon = icons[entry.kind]; return <li key={entry.id}><Icon aria-hidden /><span>{entry.title}<small>{entry.kind}{entry.category ? ` · ${entry.category}` : ""}</small></span></li>; })}</ul>
          {visibleEntries.length === 0 && <p className={styles.hubDescription}>Nenhum resultado. Que tal criar algo novo?</p>}
        </div>}
        </div>
        {panel !== "hub" && <p className={styles.hubFootnote}>Prévia interativa · dados de exemplo · rascunhos só nesta sessão</p>}
        </>}
      </dialog>
    </>
  );
}
