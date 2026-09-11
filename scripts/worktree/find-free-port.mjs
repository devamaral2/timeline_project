#!/usr/bin/env node
// Devolve a primeira porta livre em 127.0.0.1 a partir de uma porta inicial.
// Uso: node find-free-port.mjs <porta-inicial>
import { createServer } from "node:net";

const start = Number(process.argv[2]);
if (!Number.isInteger(start) || start < 1 || start > 65535) {
  console.error("Uso: find-free-port.mjs <porta-inicial>");
  process.exit(1);
}

function isFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(from) {
  for (let port = from; port <= 65535; port += 1) {
    if (await isFree(port)) return port;
  }
  throw new Error(`Nenhuma porta livre encontrada a partir de ${from}`);
}

const port = await findFreePort(start);
console.log(port);
