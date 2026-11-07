import { readConfig } from "./config";
import { createMcpHttpServer } from "./server";

const config = readConfig();
const server = createMcpHttpServer(config);

server.listen(config.MCP_PORT, config.MCP_HOST, () => {
  console.log(`MCP ouvindo em http://${config.MCP_HOST}:${config.MCP_PORT}/mcp`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
