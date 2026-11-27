import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, expect, test, vi } from "vitest";
import { agentFilesRoutes, listAgentFiles, listAgentFileBackups, readAgentFileText, requestAgentFileEdit, restoreAgentFileBackup } from "./agent-files";
import { createArtifact, deleteArtifact, editArtifact, getArtifact, listArtifacts, artifactsRoutes } from "./artifacts";
import { placesRoutes, searchPlaces } from "./places";
import { createProject, listProjects, projectsRoutes } from "./projects";
import { createTask, deleteTask, tasksRoutes, getTask, listAgenda, listTrackedTasks, setTaskSituation, suggestTags, updateTask } from "./tasks";
import { cancelRequest, getRequest, listRequests, getModelOptions, requestsRoutes, sendHermesMessage, sendModelMessage, startEditRequest, startRequest, startVoiceRequest } from "./requests";
import { requestTranscription, transcriptionRoutes } from "./transcription";
import { createRecurrence, deleteRecurrence, editRecurrence, getRecurrence, listRecurrences, recurrencesRoutes } from "./recurrences";

/**
 * Cobertura das rotas da API no cliente do web. O catálogo (`documentedOperations`, em `apps/api`) é a lista de rotas
 * documentadas; cada área do cliente declara, função por função, a rota que ela chama. Este teste confere os dois
 * sentidos e, para cada função declarada, que ela de fato chama essa rota.
 *
 * O catálogo é lido como texto, não importado: os controllers que ele referencia puxariam o Nest para dentro da
 * suíte do web. As chaves têm sempre a forma `"METODO /caminho": {`, então a expressão regular basta.
 */

// Sob jsdom o `URL` global resolve contra uma base http: por isso o caminho sai de `dirname` (ver theme-tokens.test.ts).
const CATALOG = join(dirname(fileURLToPath(import.meta.url)), "../../../../api/src/common/openapi-operations.ts");

function documentedRoutes(): string[] {
  const source = readFileSync(CATALOG, "utf8");
  return [...source.matchAll(/^\s*"((?:GET|POST|PATCH|PUT|DELETE) \/[^"]*)":\s*\{/gm)].map((match) => match[1]);
}

// Rota declarada com `{param}` contra a chamada real, que usa `ID` no lugar de cada parâmetro.
const concrete = (route: string): string => route.replace(/\{[^}]+\}/g, "ID");

const declaredRoutes: string[] = [
  ...Object.values(agentFilesRoutes),
  ...Object.values(artifactsRoutes),
  ...Object.values(tasksRoutes),
  ...Object.values(placesRoutes),
  ...Object.values(projectsRoutes),
  ...Object.values(recurrencesRoutes),
  ...Object.values(requestsRoutes),
  ...Object.values(transcriptionRoutes),
];

/**
 * Rotas do catálogo que o web não chama: quem chama é outro cliente. A extensão do navegador
 * (`apps/extension/src/api.ts`) guarda a página lida por `daily-reading`; o serviço local de transcrição reserva,
 * renova e entrega os pedidos pelas três rotas `transcription-worker`, com a chave de dispositivo.
 */
const otherClientRoutes: string[] = [
  "POST /api/tasks/daily-reading",
  "POST /api/transcription-worker/next",
  "POST /api/transcription-worker/lease",
  "POST /api/transcription-worker/deliver",
];

test("o leitor do catálogo acha as rotas documentadas", () => {
  expect(documentedRoutes().length, "nenhuma rota lida do catálogo").toBeGreaterThan(0);
});

test("toda rota documentada tem uma função no cliente", () => {
  const missing = documentedRoutes().filter((route) => !declaredRoutes.includes(route) && !otherClientRoutes.includes(route));
  expect(missing, "rotas documentadas sem função no cliente da API").toEqual([]);
});

test("toda rota que o cliente declara existe no catálogo", () => {
  const unknown = declaredRoutes.filter((route) => !documentedRoutes().includes(route));
  expect(unknown, "rotas declaradas no cliente que o catálogo não tem").toEqual([]);
});

test("as rotas de outros clientes existem no catálogo e o web não as declara", () => {
  expect(otherClientRoutes.filter((route) => !documentedRoutes().includes(route)), "rotas de outro cliente que o catálogo não tem").toEqual([]);
  expect(otherClientRoutes.filter((route) => declaredRoutes.includes(route)), "rotas que o web passou a chamar").toEqual([]);
});

// --- Cada função declarada chama a rota que declara ---------------------------------------------------------------

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

// Resposta que serve a qualquer função: sem itens nem cursor, a agenda para na primeira página.
const ANY_RESPONSE = {
  items: [],
  files: [],
  backups: [],
  text: "",
  path: "",
  taskId: "ID",
  artifactId: "ID",
  recurrenceId: "ID",
  requestId: "ID",
};

beforeEach(() => {
  net.authedFetch.mockReset();
  net.authedFetch.mockResolvedValue(ANY_RESPONSE);
});

// O corpo não entra nesta conferência, só a rota: a função recebe um objeto vazio do tipo certo.
const anyBody = <T>(): T => ({}) as T;

interface Case {
  name: string;
  route: string;
  call: () => Promise<unknown>;
}

/** Um caso por função declarada. O tipo de `calls` exige uma chamada para cada chave de `routes`. */
function casesOf<R extends Record<string, string>>(
  area: string,
  routes: R,
  calls: Record<keyof R, () => Promise<unknown>>,
): Case[] {
  return (Object.keys(routes) as (keyof R & string)[]).map((fn) => ({
    name: `${area}.${fn}`,
    route: routes[fn],
    call: calls[fn],
  }));
}

const cases: Case[] = [
  ...casesOf("tarefas", tasksRoutes, {
    listAgenda: () => listAgenda({ from: "2026-09-14T00:00:00-03:00", to: "2026-09-15T00:00:00-03:00" }),
    listTrackedTasks: () => listTrackedTasks(),
    createTask: () => createTask(anyBody(), { idempotencyKey: "k" }),
    getTask: () => getTask("ID"),
    updateTask: () => updateTask("ID", anyBody()),
    deleteTask: () => deleteTask("ID"),
    setTaskSituation: () => setTaskSituation("ID", "reviewed"),
    suggestTags: () => suggestTags("a"),
  }),
  ...casesOf("locais", placesRoutes, {
    searchPlaces: () => searchPlaces("av paulista"),
  }),
  ...casesOf("projetos", projectsRoutes, {
    listProjects: () => listProjects(),
    createProject: () => createProject("braid"),
  }),
  ...casesOf("artefatos", artifactsRoutes, {
    listArtifacts: () => listArtifacts(),
    getArtifact: () => getArtifact("ID"),
    createArtifact: () => createArtifact(anyBody(), { idempotencyKey: "k" }),
    editArtifact: () => editArtifact("ID", anyBody()),
    deleteArtifact: () => deleteArtifact("ID"),
  }),
  ...casesOf("séries", recurrencesRoutes, {
    listRecurrences: () => listRecurrences(),
    getRecurrence: () => getRecurrence("ID"),
    createRecurrence: () => createRecurrence(anyBody(), { idempotencyKey: "k" }),
    editRecurrence: () => editRecurrence("ID", anyBody()),
    deleteRecurrence: () => deleteRecurrence("ID"),
  }),
  ...casesOf("pedidos", requestsRoutes, {
    startRequest: () => startRequest(anyBody()),
    startEditRequest: () => startEditRequest(anyBody()),
    sendHermesMessage: () => sendHermesMessage(anyBody()),
    sendModelMessage: () => sendModelMessage(anyBody()),
    getModelOptions: () => getModelOptions(),
    startVoiceRequest: () => startVoiceRequest(anyBody()),
    getRequest: () => getRequest("ID"),
    listRequests: () => listRequests(),
    cancelRequest: () => cancelRequest("ID"),
  }),
  ...casesOf("transcrição", transcriptionRoutes, {
    requestTranscription: () => requestTranscription("https://youtu.be/dQw4w9WgXcQ"),
  }),
  ...casesOf("arquivos do agente", agentFilesRoutes, {
    listAgentFiles: () => listAgentFiles(),
    readAgentFileText: () => readAgentFileText("skills/a.md"),
    listAgentFileBackups: () => listAgentFileBackups("skills/a.md"),
    restoreAgentFileBackup: () => restoreAgentFileBackup("skills/a.md", "ID"),
    requestAgentFileEdit: () => requestAgentFileEdit(anyBody()),
  }),
];

test.each(cases)("$name chama $route, e só essa rota", async ({ route, call }) => {
  await call();
  const sent = (net.authedFetch.mock.calls as [string, RequestInit | undefined][]).map(
    ([url, init]) => `${init?.method ?? "GET"} ${url.split("?")[0]}`,
  );
  expect(sent).toEqual([concrete(route)]);
});
