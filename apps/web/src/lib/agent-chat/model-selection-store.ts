"use client";

import type { ModelEffort, ModelOptionsDto, ModelProvider, ModelSelection } from "@repo/contracts";
import { useCallback, useSyncExternalStore } from "react";
import { ModelOffError, getModelOptions } from "@/lib/api/requests";
import {
  type StoredModelSelection, providerOf, readStoredSelection, resolveSelection, withEffort, withModel, withProvider,
  writeStoredSelection,
} from "./model-selection";

/**
 * A escolha de provedor, modelo e esforco, uma so para a pagina: o campo do chat e o campo de edicao do detalhe
 * mostram a mesma e a mandam em todo pedido. O que o servidor oferece (`options`) e lido uma vez e guardado ate
 * alguem pedir de novo; a escolha (`state`) fica no aparelho a cada troca.
 */
interface Snapshot {
  /** O que o servidor oferece; `null` antes da leitura e quando o modo modelo nao existe neste ambiente. */
  options: ModelOptionsDto | null;
  /** A escolha atual e o ultimo modelo de cada provedor, ja conferidos contra `options`. */
  state: StoredModelSelection | null;
}

const EMPTY: Snapshot = { options: null, state: null };

let snapshot: Snapshot = EMPTY;
/** A leitura em curso: quem pede as opcoes enquanto ela anda espera a mesma. */
let loading: Promise<ModelOptionsDto> | null = null;
/** A ultima leitura disse que o modo modelo nao existe aqui: quem so quer a escolha nao pergunta de novo a cada pedido. */
let off: ModelOffError | null = null;
const listeners = new Set<() => void>();

function publish(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(state: StoredModelSelection): void {
  publish({ ...snapshot, state });
  writeStoredSelection(state);
}

/**
 * Le as opcoes do servidor e confere a escolha guardada contra elas. Uma leitura que deu certo vale ate `fresh`
 * pedir outra. Sem nenhum provedor com chave a API responde 404 e isto lanca `ModelOffError`, que fica lembrado ate
 * um `fresh` (o comando de modelo, "Nova conversa"); uma falha de rede nao e lembrada nem apaga o que ja foi lido.
 */
export function loadModelOptions(fresh = false): Promise<ModelOptionsDto> {
  if (loading) return loading;
  if (!fresh && snapshot.options) return Promise.resolve(snapshot.options);
  if (!fresh && off) return Promise.reject(off);
  loading = getModelOptions().then(
    (options) => {
      loading = null;
      off = null;
      const state = resolveSelection(options, snapshot.state ?? readStoredSelection());
      publish({ options, state });
      writeStoredSelection(state);
      return options;
    },
    (error: unknown) => {
      loading = null;
      if (error instanceof ModelOffError) {
        off = error;
        // O modo saiu do ar: o seletor nao mostra uma lista que o servidor ja nao oferece.
        if (snapshot.options) publish({ ...snapshot, options: null });
      }
      throw error;
    },
  );
  return loading;
}

/** A escolha de agora, sem ler nada: `undefined` enquanto as opcoes nao chegaram ou quando o modo nao existe. */
export function currentModelSelection(): ModelSelection | undefined {
  return snapshot.options ? snapshot.state?.current : undefined;
}

export function currentModelOptions(): ModelOptionsDto | null {
  return snapshot.options;
}

/**
 * A escolha que um pedido leva: a que o campo mostra. Le as opcoes se ainda nao leu; sem o modo modelo (ou sem
 * rede) o pedido vai sem escolha e roda com o modelo do servidor.
 */
export async function modelSelectionForRequest(): Promise<ModelSelection | undefined> {
  try {
    await loadModelOptions();
  } catch {
    return undefined;
  }
  return currentModelSelection();
}

/** Troca de provedor: retoma o modelo que ele tinha na ultima vez. Devolve a escolha nova, ou nada se ele nao existe aqui. */
export function chooseModelProvider(provider: ModelProvider): ModelSelection | undefined {
  const { options, state } = snapshot;
  if (!options || !providerOf(options, provider)) return undefined;
  const next = withProvider(options, state ?? resolveSelection(options, readStoredSelection()), provider);
  commit(next);
  return next.current;
}

export function chooseModel(model: string): void {
  const { options, state } = snapshot;
  if (state && options && providerOf(options, state.current.provider)?.models.some((entry) => entry.id === model)) {
    commit(withModel(state, model));
  }
}

export function chooseModelEffort(effort: ModelEffort): void {
  if (snapshot.state) commit(withEffort(snapshot.state, effort));
}

/** So para os testes: cada um comeca sem opcoes lidas e sem escolha em memoria. */
export function resetModelSelectionStore(): void {
  loading = null;
  off = null;
  snapshot = EMPTY;
  for (const listener of listeners) listener();
}

/** O que um campo precisa para mostrar o seletor: o que o servidor oferece, a escolha e como troca-la. */
export interface ModelSelectionControls {
  options: ModelOptionsDto | null;
  selection: ModelSelection | null;
  chooseProvider: (provider: ModelProvider) => void;
  chooseModel: (model: string) => void;
  chooseEffort: (effort: ModelEffort) => void;
  /**
   * Le as opcoes do servidor de novo, por tras: o campo que aparece mostra o que o servidor oferece agora, e ate a
   * resposta chegar vale o que ja foi lido. Nunca rejeita: sem o modo modelo o campo so fica sem o seletor.
   */
  load: () => Promise<void>;
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

/** A escolha de modelo para um campo: acompanha as trocas feitas em qualquer outro campo da pagina. */
export function useModelSelection(): ModelSelectionControls {
  const { options, state } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const chooseProvider = useCallback((provider: ModelProvider) => {
    chooseModelProvider(provider);
  }, []);
  const load = useCallback(() => loadModelOptions(true).then(() => undefined, () => undefined), []);
  return {
    options,
    selection: options ? (state?.current ?? null) : null,
    chooseProvider,
    chooseModel,
    chooseEffort: chooseModelEffort,
    load,
  };
}
