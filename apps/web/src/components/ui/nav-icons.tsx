/**
 * Os ícones das três abas da barra inferior. São desenhos próprios, na grade de
 * 24 e no traço dos outros ícones do app (a barra é quem define a espessura);
 * o app Android repete os mesmos traçados em `core/designsystem/NavIcons.kt`.
 */
const stroke = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Tarefas: a caixa aberta num canto, com o check saindo por ele. */
export function TasksNavIcon() {
  return (
    <svg {...stroke} aria-hidden="true">
      <path d="M20.5 12v6.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H15" />
      <path d="M8 11l3.5 3.5L21.5 4" />
    </svg>
  );
}

/** Agenda: o calendário com um só dia marcado, à esquerda. */
export function AgendaNavIcon() {
  return (
    <svg {...stroke} aria-hidden="true">
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <rect x="6.25" y="13.25" width="4.75" height="4.75" rx="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Documentos: duas páginas empilhadas, a da frente com as linhas do texto. */
export function DocumentsNavIcon() {
  return (
    <svg {...stroke} aria-hidden="true">
      <rect x="3.5" y="6.5" width="13" height="15" rx="2" />
      <path d="M7 11.5h6M7 15.5h4" />
      <path d="M8 2.75h10.5a2 2 0 0 1 2 2V18" />
    </svg>
  );
}
