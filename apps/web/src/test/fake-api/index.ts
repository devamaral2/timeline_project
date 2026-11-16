import type { ZodType } from "zod";
import { ApiError } from "@/lib/api/authed-fetch";

/**
 * API falsa em memória, no lugar do `authedFetch`. Cada área (eventos,
 * artefatos, …) é um arquivo em `./` com as suas rotas; a tela monta só as
 * áreas de que precisa. Não há lista central de áreas: criar uma área não
 * mexe em nenhum arquivo que outra área usa.
 *
 * Toda rota declara os esquemas do contrato do corpo e da resposta. O corpo
 * que não passa no esquema, e a resposta que não passa, lançam erro de teste
 * (não `ApiError`): o teste quebra no lugar do bug, não em produção.
 */

export type FakeMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface FakeRequest {
  method: FakeMethod;
  /** Caminho sem a query, já com os parâmetros da rota preenchidos em `params`. */
  pathname: string;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Corpo já validado contra `input` da rota. */
  body: unknown;
  idempotencyKey?: string;
}

/** Sem `body`, a resposta é 204 ou um erro. */
export interface FakeResult {
  status: number;
  body?: unknown;
}

export interface FakeRoute {
  method: FakeMethod;
  /** Padrão com parâmetros: `/api/events/:eventId`. */
  path: string;
  /** Esquema do corpo recebido. Sem ele, a rota não aceita corpo. */
  input?: ZodType;
  /** Esquema da resposta com corpo. Sem ele, a resposta não é conferida. */
  output?: ZodType;
  /** Aceita `Idempotency-Key`: repetir a chave devolve a primeira resposta, ou 422 se o corpo mudou. */
  idempotent?: boolean;
  handle(request: FakeRequest, store: FakeStore): FakeResult;
}

export interface FakeArea {
  name: string;
  routes: FakeRoute[];
}

export interface FakeStore {
  /** Uma coleção por nome, criada na primeira vez. Ex.: `store.table<EventDto>("events")`. */
  table<T>(name: string): Map<string, T>;
  /** `ev-1`, `ev-2`, … por prefixo. */
  nextId(prefix: string): string;
  /** Tamanho de página da agenda (ver `FakeApiOptions.pageSize`). */
  pageSize: number;
}

export interface FakeCall {
  method: FakeMethod;
  pathname: string;
  query: Record<string, string>;
  body: unknown;
  idempotencyKey?: string;
}

export interface FakeApiOptions {
  areas: FakeArea[];
  /** Linhas iniciais por coleção, pelo `id`. Ex.: `{ events: [eventFixture({ id: "ev-1" })] }`. */
  seed?: Record<string, readonly { id: string }[]>;
  /** Quantos itens a agenda devolve por página. Padrão 50, como a API. */
  pageSize?: number;
}

export interface FakeApi {
  /** Mesma assinatura do `authedFetch`: instale com `mockImplementation(api.authedFetch)`. */
  authedFetch(path: string, init?: RequestInit): Promise<unknown>;
  /** Todas as chamadas recebidas, na ordem. Os testes conferem a rede por aqui. */
  calls: FakeCall[];
  store: FakeStore;
  /**
   * A próxima chamada a este caminho (exato, sem query) responde com `status`,
   * sem executar a rota. Serve para testar 403, 400 e 5xx.
   */
  failNext(method: FakeMethod, pathname: string, status: number): void;
}

/** A mesma regra da API real (`IDEMPOTENCY_KEY_FORMAT`). */
const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9._:-]{1,128}$/;

interface CompiledRoute {
  route: FakeRoute;
  pattern: RegExp;
  names: string[];
}

export function createFakeApi(options: FakeApiOptions): FakeApi {
  const routes = options.areas.flatMap((area) => area.routes).map(compile);
  const tables = new Map<string, Map<string, unknown>>();
  const counters = new Map<string, number>();
  const idempotent = new Map<string, { hash: string; result: FakeResult }>();
  const failures: { method: FakeMethod; pathname: string; status: number }[] = [];
  const calls: FakeCall[] = [];

  const store: FakeStore = {
    table<T>(name: string): Map<string, T> {
      let table = tables.get(name);
      if (!table) {
        table = new Map();
        tables.set(name, table);
      }
      return table as Map<string, T>;
    },
    nextId(prefix: string): string {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}-${next}`;
    },
    pageSize: options.pageSize ?? 50,
  };

  for (const [name, rows] of Object.entries(options.seed ?? {})) {
    const table = store.table<{ id: string }>(name);
    for (const row of rows) table.set(row.id, row);
  }

  async function authedFetch(path: string, init: RequestInit = {}): Promise<unknown> {
    const url = new URL(path, "http://api-falsa.local");
    const method = (init.method ?? "GET").toUpperCase() as FakeMethod;
    const headers = new Headers(init.headers);
    const idempotencyKey = headers.get("Idempotency-Key") ?? undefined;
    const body = parseBody(init.body);

    calls.push({
      method,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      idempotencyKey,
    });

    const failure = failures.findIndex((f) => f.method === method && f.pathname === url.pathname);
    if (failure !== -1) {
      const [{ status }] = failures.splice(failure, 1);
      throw new ApiError(status, `${method} ${path} -> ${status}`);
    }

    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_FORMAT.test(idempotencyKey)) {
      throw new ApiError(400, `${method} ${path} -> 400`);
    }

    const compiled = matchRoute(routes, method, url.pathname);
    const params = compiled.params;
    const route = compiled.route;

    let validBody: unknown = body;
    if (route.input) {
      if (body === undefined) throw contractError(route, "corpo ausente");
      const parsed = route.input.safeParse(body);
      if (!parsed.success) throw contractError(route, `corpo recebido: ${parsed.error.message}`);
      validBody = parsed.data;
    }

    const request: FakeRequest = { method, pathname: url.pathname, params, query: url.searchParams, body: validBody, idempotencyKey };

    const claimKey = route.idempotent && idempotencyKey !== undefined ? `${route.method} ${route.path}\u0000${idempotencyKey}` : undefined;
    const hash = claimKey !== undefined ? JSON.stringify(validBody ?? null) : "";
    const replay = claimKey !== undefined ? idempotent.get(claimKey) : undefined;
    if (replay) {
      if (replay.hash !== hash) throw new ApiError(422, `${method} ${path} -> 422`);
      return finish(route, replay.result, method, path);
    }

    const result = route.handle(request, store);
    if (claimKey !== undefined && result.status < 400) idempotent.set(claimKey, { hash, result });
    return finish(route, result, method, path);
  }

  function finish(route: FakeRoute, result: FakeResult, method: FakeMethod, path: string): unknown {
    if (result.status >= 400) throw new ApiError(result.status, `${method} ${path} -> ${result.status}`);
    if (result.status === 204 || result.body === undefined) return undefined;
    // Passa pelo JSON, como o fio: undefined some e datas viram texto.
    const wire: unknown = JSON.parse(JSON.stringify(result.body));
    if (route.output) {
      const parsed = route.output.safeParse(wire);
      if (!parsed.success) throw contractError(route, `resposta devolvida: ${parsed.error.message}`);
    }
    return wire;
  }

  function failNext(method: FakeMethod, pathname: string, status: number): void {
    failures.push({ method, pathname, status });
  }

  return { authedFetch, calls, store, failNext };
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== "string") throw new Error("A API falsa só aceita corpo JSON em texto (JSON.stringify).");
  return JSON.parse(body);
}

function compile(route: FakeRoute): CompiledRoute {
  const names: string[] = [];
  const source = route.path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    names.push(name);
    return "([^/]+)";
  });
  return { route, pattern: new RegExp(`^${source}$`), names };
}

function matchRoute(routes: CompiledRoute[], method: FakeMethod, pathname: string) {
  let pathMatched = false;
  for (const compiled of routes) {
    const match = compiled.pattern.exec(pathname);
    if (!match) continue;
    pathMatched = true;
    if (compiled.route.method !== method) continue;
    const params = Object.fromEntries(compiled.names.map((name, i) => [name, decodeURIComponent(match[i + 1] ?? "")]));
    return { route: compiled.route, params };
  }
  if (pathMatched) throw new Error(`A API falsa não tem ${method} ${pathname}.`);
  throw new Error(`A API falsa não conhece ${method} ${pathname}: inclua a área certa em \`areas\`.`);
}

function contractError(route: FakeRoute, detail: string): Error {
  return new Error(`Fora do contrato em ${route.method} ${route.path}; ${detail}`);
}
