import { request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";

export interface UpgradeProxyLogger {
  warn(message: string): void;
}

/**
 * Encaminha upgrades do chat para a API sem expor a API ao browser. O ciclo de
 * vida (attach/detach) e explicito para que o composition root o controle sem
 * depender de hooks do Nest.
 */
export class ApiUpgradeProxy {
  constructor(
    private readonly apiServiceUrl: string,
    private readonly logger: UpgradeProxyLogger = { warn: (message) => console.warn(message) },
  ) {}

  attach(server: Server): void {
    server.on("upgrade", this.onUpgrade);
  }

  detach(server: Server): void {
    server.off("upgrade", this.onUpgrade);
  }

  private readonly onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (requestUrl.pathname !== "/api/ai/chat") return;

    const target = new URL(requestUrl.pathname + requestUrl.search, this.apiServiceUrl);
    const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest;
    const proxy = requestFn(target, {
      method: request.method,
      headers: { ...request.headers, host: target.host },
    });
    proxy.once("upgrade", (response, upstreamSocket, upstreamHead) => {
      const statusLine = `HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage ?? "Switching Protocols"}\r\n`;
      socket.write(statusLine);
      for (const [name, value] of Object.entries(response.headers)) {
        if (value === undefined) continue;
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) socket.write(`${name}: ${item}\r\n`);
      }
      socket.write("\r\n");
      if (upstreamHead.length > 0) socket.write(upstreamHead);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
    });
    proxy.once("response", (response) => {
      this.logger.warn(`API rejected WebSocket upgrade with ${response.statusCode}`);
      socket.destroy();
      response.resume();
    });
    proxy.once("error", () => socket.destroy());
    socket.once("error", () => proxy.destroy());
    proxy.end(head);
  };
}
