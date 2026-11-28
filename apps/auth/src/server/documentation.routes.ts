import { authOpenApiDocument } from "../http/openapi";
import type { AuthRoute } from "./routes";

/**
 * O documento é estático e a referência é servida pelo renderer do Scalar. O
 * pacote é ESM: o processo do Auth continua CommonJS, então ele entra por
 * import dinâmico, uma única vez por processo. Nenhuma das duas rotas passa
 * por autenticação.
 */

let referenceHtml: Promise<string> | undefined;

function documentationHtml(): Promise<string> {
  referenceHtml ??= import("@scalar/client-side-rendering").then(
    ({ DEFAULT_CDN, renderApiReference }) =>
      renderApiReference({
        config: { theme: "purple", darkMode: false, content: authOpenApiDocument },
        pageTitle: "Braid Auth API",
        cdn: DEFAULT_CDN,
      }),
  );
  return referenceHtml;
}

export function documentationRoutes(): AuthRoute[] {
  return [
    {
      method: "GET",
      path: "/openapi.json",
      handler: async () => authOpenApiDocument,
    },
    {
      method: "GET",
      path: "/docs",
      handler: async (_request, reply) => reply.type("text/html; charset=utf-8").send(await documentationHtml()),
    },
  ];
}
