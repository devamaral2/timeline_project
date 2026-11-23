/**
 * Fixtures do filtro de executor e da busca do menu da seção: os modos de
 * visualização (`view-mode.ts`), a regra que diz de quem é um documento
 * (`artifactActor`) e a busca da agenda. A busca da agenda (`plain` em
 * `agenda-screen.tsx`) não é exportada, então a expressão é repetida aqui,
 * igual, para as saídas virem do mesmo cálculo que o web faz.
 */
import { ARTIFACT_TYPE_ORDER, artifactActor } from "../../../apps/web/src/lib/artifacts/artifact-model";
import { DEFAULT_VIEW_MODE_ID, VIEW_MODES, VIEW_MODE_STORAGE_KEY, viewModeOf } from "../../../apps/web/src/lib/tasks/view-mode";

/** Cópia literal de `plain` em `components/agenda/agenda-screen.tsx`. */
function plain(text: string) {
  return text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const SEARCH_NAMES = [
  "Café com a Ana", "CAFÉ DA MANHÃ", "Reunião de planejamento", "Almoço", "Ação rápida", "Pagar o condomínio",
  "Ligar para o banco", "Jantar até a meia-noite", "Çedilha e ÀÉÎÕÜ", "Treino de amanhã", "İstanbul", "Prova de 1h30",
];

const SEARCHES = ["", "   ", "cafe", "CAFÉ", " café ", "reuniao", "acao", "ÇEDILHA", "aeiou", "condomínio", "xyz", "1h30", "de a", "Istanbul"];

export function executorFixtures(): Record<string, unknown> {
  return {
    "executor-view-modes": {
      storageKey: VIEW_MODE_STORAGE_KEY,
      defaultId: DEFAULT_VIEW_MODE_ID,
      modes: VIEW_MODES.map((mode) => ({ id: mode.id, actor: mode.actor ?? null })),
      lookups: ["human", "agent", "all", "HUMAN", "", "nobody", null].map((id) => ({ id, resolved: viewModeOf(id).id })),
    },
    "executor-artifact-actor": {
      cases: ARTIFACT_TYPE_ORDER.map((type) => ({ type, actor: artifactActor(type) })),
    },
    "executor-agenda-search": {
      names: SEARCH_NAMES,
      cases: SEARCHES.map((search) => {
        const needle = plain(search.trim());
        return {
          search,
          matches: SEARCH_NAMES.filter((name) => (needle ? plain(name).includes(needle) : true)),
        };
      }),
    },
  };
}
