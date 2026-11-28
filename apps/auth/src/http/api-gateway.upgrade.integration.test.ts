import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { once } from "node:events";
import { AddressInfo } from "node:net";
import { createTestApp, type TestApp } from "../testing/create-test-app";

/**
 * O upgrade do chat atravessa o Auth e chega à API por um socket real. O teste
 * não usa `inject`: ele abre TCP, escreve a linha de upgrade e verifica os
 * bytes que voltam -- inclusive o desligamento sem listener residual.
 */

interface UpgradeSeen {
  method: string | undefined;
  url: string | undefined;
  headers: NodeJS.Dict<string | string[]>;
}

interface UpgradeUpstream {
  url: string;
  seen: UpgradeSeen[];
  close(): Promise<void>;
}

async function startUpgradeUpstream(): Promise<UpgradeUpstream> {
  const seen: UpgradeSeen[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((_request, response) => { response.writeHead(404); response.end(); });
  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket: Socket, head) => {
    seen.push({ method: request.method, url: request.url, headers: request.headers });
    if (request.url?.includes("reject=1")) {
      socket.end("HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\n\r\n");
      return;
    }
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Upstream: yes\r\n\r\n",
    );
    if (head.length > 0) socket.write(`echo:${head.toString()}`);
    socket.on("data", (chunk) => socket.write(`echo:${chunk.toString()}`));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    seen,
    close: async () => {
      // Um socket de upgrade não é rastreado pelo `close()` do servidor; sem
      // derrubá-lo o teardown esperaria para sempre.
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

interface UpgradeClient {
  socket: Socket;
  text(): string;
  waitFor(predicate: (text: string) => boolean): Promise<string>;
  close(): void;
}

async function connectUpgrade(port: number, path: string): Promise<UpgradeClient> {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  const chunks: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  const text = () => Buffer.concat(chunks).toString();
  socket.write(
    `GET ${path} HTTP/1.1\r\nHost: auth.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n",
  );
  const waitFor = async (predicate: (value: string) => boolean): Promise<string> => {
    if (predicate(text())) return text();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`timed out waiting for upgrade bytes; got ${JSON.stringify(text())}`)), 5_000);
      const onData = () => {
        if (!predicate(text())) return;
        clearTimeout(timeout);
        socket.off("data", onData);
        resolve();
      };
      socket.on("data", onData);
    });
    return text();
  };
  return { socket, text, waitFor, close: () => socket.destroy() };
}

function portOf(url: string): number {
  return Number(new URL(url).port);
}

/**
 * Fecha o app derrubando antes os sockets de upgrade: eles não entram na
 * contagem do `server.close()` e deixariam o teardown pendurado.
 */
async function closeApp(target: TestApp): Promise<void> {
  target.server.closeAllConnections();
  await target.close();
}

describe("upgrade de WebSocket pelo gateway", () => {
  let upstream: UpgradeUpstream;
  let app: TestApp;

  beforeAll(async () => {
    upstream = await startUpgradeUpstream();
    app = await createTestApp({ API_SERVICE_URL: upstream.url });
  });

  afterAll(async () => {
    await upstream?.close();
    await closeApp(app);
  });
  it("estabelece o upgrade com o upstream e faz a ponte bidirecional", async () => {
    const client = await connectUpgrade(portOf(app.url), "/api/ai/chat?session=abc");
    try {
      const handshake = await client.waitFor((text) => text.includes("\r\n\r\n"));
      expect(handshake).toContain("HTTP/1.1 101 Switching Protocols");
      expect(handshake).toContain("x-upstream: yes");

      expect(upstream.seen).toHaveLength(1);
      expect(upstream.seen[0]).toMatchObject({ method: "GET", url: "/api/ai/chat?session=abc" });
      expect(upstream.seen[0]?.headers.upgrade).toBe("websocket");

      client.socket.write("ping");
      const echoed = await client.waitFor((text) => text.includes("echo:ping"));
      expect(echoed).toContain("echo:ping");
    } finally {
      client.close();
    }
  });

  it("derruba o socket do cliente quando a API recusa o upgrade", async () => {
    const client = await connectUpgrade(portOf(app.url), "/api/ai/chat?reject=1");
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("socket did not close after the upstream refusal")), 5_000);
        const done = () => { clearTimeout(timeout); resolve(); };
        client.socket.once("close", done);
        client.socket.once("end", done);
        client.socket.once("error", done);
      });
      expect(client.text()).not.toContain("101");
    } finally {
      client.close();
    }
    expect(upstream.seen.at(-1)?.url).toBe("/api/ai/chat?reject=1");
  });

  it("remove o listener de upgrade quando o Auth encerra", async () => {
    const localUpstream = await startUpgradeUpstream();
    const localApp = await createTestApp({ API_SERVICE_URL: localUpstream.url });
    const port = portOf(localApp.url);

    const before = await connectUpgrade(port, "/api/ai/chat");
    await before.waitFor((text) => text.includes("101"));
    before.close();

    await localUpstream.close();
    await closeApp(localApp);

    const refused = connect(port, "127.0.0.1");
    const error = await new Promise<NodeJS.ErrnoException | undefined>((resolve) => {
      const timeout = setTimeout(() => resolve(undefined), 5_000);
      refused.once("error", (cause: NodeJS.ErrnoException) => { clearTimeout(timeout); resolve(cause); });
      refused.once("connect", () => { clearTimeout(timeout); resolve(undefined); });
    });
    refused.destroy();
    expect(error?.code).toBe("ECONNREFUSED");
  });
});
