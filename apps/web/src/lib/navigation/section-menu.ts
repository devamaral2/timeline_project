import type { LucideIcon } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

/**
 * O menu de opções da barra inferior (`components/shell/section-menu.tsx`) mora
 * no shell, mas quem sabe filtrar é a tela. Cada tela publica aqui o que o menu
 * dela mostra: as listas (filtros prontos), a busca e a configuração. O estado
 * continua na tela; o menu só chama as funções que ela entrega.
 */

export type SectionId = "tasks" | "agenda" | "notes";

/** Uma linha de "Listas": um filtro pronto que a tela sabe aplicar. */
export interface SectionList {
  id: string;
  name: string;
  /** Os parâmetros da lista, em mono (ex.: `#trabalho`). */
  desc?: string;
  Icon: LucideIcon;
  count?: number;
  selected: boolean;
  onPick: () => void;
}

export interface SectionChoice {
  label: string;
  selected: boolean;
  onPick: () => void;
}

/** Uma linha da configuração, aberta pela engrenagem. */
export type SectionSetting =
  | { kind: "segment"; label: string; options: SectionChoice[] }
  | { kind: "toggles"; label: string; options: SectionChoice[] }
  | { kind: "switch"; label: string; hint?: string; on: boolean; onToggle: () => void };

export interface SectionMenuModel {
  /** O número ao lado do nome da tela. */
  count?: number;
  lists: SectionList[];
  search?: { label: string; value: string; onChange: (value: string) => void };
  settings?: SectionSetting[];
  /** Há busca ou filtro ativo: a aba ganha o ponto. */
  filtered: boolean;
  onClear?: () => void;
}

const models = new Map<SectionId, SectionMenuModel>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A tela publica o menu dela a cada desenho e o retira ao sair. */
export function usePublishSectionMenu(section: SectionId, model: SectionMenuModel): void {
  useEffect(() => {
    models.set(section, model);
    emit();
  });
  useEffect(() => () => {
    models.delete(section);
    emit();
  }, [section]);
}

/** O menu que a tela desta seção publicou; `undefined` enquanto ela não está montada. */
export function useSectionMenu(section: SectionId): SectionMenuModel | undefined {
  return useSyncExternalStore(subscribe, () => models.get(section), () => undefined);
}
