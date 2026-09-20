import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

export interface FakeHttpRequest { method: string; path: string; headers: Record<string, string | string[] | undefined> }
export type FakeHttpHandler = (request: FakeHttpRequest) => { status: number; body: string } | Promise<{ status: number; body: string }>;

export interface FakeHttpServer {
  url: string;
  requests: FakeHttpRequest[];
  respondWith(handler: FakeHttpHandler): void;
  /** Um `fetch` que redireciona qualquer host para este servidor, preservando
   *  caminho e query. E o que deixa o gateway real -- e nao um dublê -- rodar
   *  contra uma resposta controlada. */
  fetcher: typeof fetch;
  close(): Promise<void>;
}

/**
 * Servidor HTTP local para os testes de ponta a ponta.
 *
 * Existe para que o gateway de verdade seja exercitado: o parser da resposta do
 * HIBP, o timeout, o tratamento de status inesperado. Um dublê da interface
 * pularia justamente o codigo que costuma quebrar em producao.
 */
export async function startFakeHttpServer(initial: FakeHttpHandler): Promise<FakeHttpServer> {
  let handler = initial;
  const requests: FakeHttpRequest[] = [];
  const server: Server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    const request: FakeHttpRequest = { method: incoming.method ?? "GET", path: incoming.url ?? "/", headers: incoming.headers };
    requests.push(request);
    void Promise.resolve(handler(request))
      .then((result) => { response.writeHead(result.status, { "content-type": "text/plain" }); response.end(result.body); })
      .catch(() => { response.writeHead(500); response.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  const fetcher: typeof fetch = (input, init) => {
    const original = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    return fetch(`${url}${original.pathname}${original.search}`, init);
  };

  return {
    url, requests, fetcher,
    respondWith(next: FakeHttpHandler) { handler = next; },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
