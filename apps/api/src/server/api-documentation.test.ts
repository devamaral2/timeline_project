import { describe, expect, test } from "vitest";
import { z } from "zod";
import { documentedOperations, documentedSchemas, documentedTags } from "../common/openapi-operations";
import type { ApiRoute } from "../http/api-route";
import { InMemoryIdempotencyStore } from "../http/idempotency/testing/in-memory-idempotency-store";
import { apiOpenApiDocument, describeOperation } from "./api-documentation";
import { DECLARED_API_OPERATIONS, declaredOperationKey } from "./declared-operations";
import { createFastifyInstance, registerApiRoutes, registerDocumentation } from "./route-registrar";

const KEY = "gateway-key-with-at-least-32-characters";
const ROTA_ANTIGA = "/api/events"; // a rota antiga: o catálogo não pode tê-la

const stubRoutes = (): ApiRoute[] => DECLARED_API_OPERATIONS.map((operation) => ({ ...operation, handler: () => undefined }));

async function serverWith(routes: readonly ApiRoute[]) {
  const app = createFastifyInstance();
  registerApiRoutes(app, routes, {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
    logger: { warn() {}, error() {} },
  });
  await registerDocumentation(app, routes);
  return app;
}

describe("paridade entre rotas e documentação", () => {
  test("toda rota registrada está no catálogo, e o catálogo não descreve rota que não existe", async () => {
    const app = await serverWith(stubRoutes());
    const response = await app.inject({ method: "GET", url: "/openapi.json" });
    const document = JSON.parse(response.body) as { paths: Record<string, Record<string, unknown>> };

    const declared = DECLARED_API_OPERATIONS.map(declaredOperationKey);
    const documented = Object.keys(documentedOperations);
    const served = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    );

    expect(new Set(declared).size).toBe(declared.length);
    expect([...documented].sort()).toEqual([...declared].sort());
    expect([...served].sort()).toEqual([...declared].sort());
    expect(documented.filter((route) => route.includes(ROTA_ANTIGA))).toEqual([]);
    await app.close();
  });

  test("uma rota registrada fora do catálogo impede a documentação de ser construída", async () => {
    const app = createFastifyInstance();
    const outside: ApiRoute[] = [
      { method: "GET", path: "/api/fora-do-catalogo", status: 200, authentication: "gateway-session", handler: () => undefined },
    ];

    await expect(registerDocumentation(app, outside)).rejects.toThrow(/nao esta documentada/);
  });

  test("cada entrada aponta para um grupo e para formatos que existem", () => {
    const tags = documentedTags.map((tag) => tag.name);
    for (const [route, doc] of Object.entries(documentedOperations)) {
      expect(tags, route).toContain(doc.tag);
      for (const name of [doc.body, doc.success.schema]) if (name) expect(documentedSchemas, route).toHaveProperty(name);
      // So o 204 responde sem corpo.
      expect(doc.success.schema === undefined, route).toBe(doc.success.status === 204);
      // Uma rota com corpo tem o que recusar.
      if (doc.body) expect(doc.errors, route).toHaveProperty("400");
    }
  });
});

describe("documento e referência públicos", () => {
  test("o documento é servido sem autenticação, com a mesma lista e os mesmos formatos", async () => {
    const app = await serverWith(stubRoutes());

    const response = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    const document = JSON.parse(response.body) as { components: { schemas: Record<string, unknown> }; tags: Array<{ name: string }> };
    expect(Object.keys(document.components.schemas).sort()).toEqual(Object.keys(documentedSchemas).sort());
    expect(document.tags.map((tag) => tag.name)).toEqual(documentedTags.map((tag) => tag.name));

    const slash = await app.inject({ method: "GET", url: "/openapi.json/" });
    expect(slash.statusCode).toBe(200);

    const docs = await app.inject({ method: "GET", url: "/docs" });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers["content-type"]).toContain("text/html");
    expect(docs.body).toContain("Braid API");
    expect(docs.body.toLowerCase()).toContain("scalar");
    await app.close();
  });
});

describe("descrição das operações", () => {
  test("o documento ganha filtros opcionais, corpo e resposta a partir do catálogo", () => {
    const document = apiOpenApiDocument(DECLARED_API_OPERATIONS);
    const list = document.paths["/api/tasks"].get as {
      summary: string;
      parameters: Array<{ name: string; required: boolean; schema: Record<string, unknown> }>;
      responses: Record<string, { content?: unknown }>;
    };

    expect(list.summary).toBe("Lista a agenda, em páginas");
    expect(list.parameters.map((parameter) => parameter.name)).toEqual(["from", "to", "actor", "kind", "tag", "cursor", "limit"]);
    expect(list.parameters.every((parameter) => !parameter.required)).toBe(true);
    expect(list.parameters.find((parameter) => parameter.name === "actor")?.schema.enum).toEqual(["human", "agent"]);
    expect(list.responses["200"].content).toEqual({ "application/json": { schema: { $ref: "#/components/schemas/AgendaPage" } } });
    expect(Object.keys(list.responses)).toEqual(expect.arrayContaining(["200", "400", "401", "403"]));

    const create = document.paths["/api/tasks"].post as {
      requestBody?: unknown;
      parameters: Array<{ in: string; name: string }>;
    };
    expect(create.requestBody).toEqual({
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/CreateTaskInput" } } },
    });
    expect(create.parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual(["header:Idempotency-Key"]);

    const update = document.paths["/api/tasks/{taskId}"].patch as {
      parameters: Array<{ in: string; name: string }>;
      responses: Record<string, { content?: unknown }>;
    };
    expect(update.parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual(["path:taskId"]);
    expect(update.responses["204"].content).toBeUndefined();
    expect(Object.keys(update.responses)).toEqual(expect.arrayContaining(["404", "409"]));

    const schemas = document.components.schemas as Record<string, { properties: Record<string, unknown>; required: string[] }>;
    // O id vem do caminho, não do corpo.
    expect(schemas.UpdateTaskInput.properties).not.toHaveProperty("taskId");
    expect(schemas.UpdateTaskInput.required).toEqual(["expectedRevision"]);
  });

  test("as operações migradas de tags e locais entram no documento a partir do catálogo", () => {
    const document = apiOpenApiDocument(DECLARED_API_OPERATIONS);
    const tags = document.paths["/api/tags"].get as { tags: string[]; responses: Record<string, unknown> };
    const places = document.paths["/api/places"].get as { tags: string[]; responses: Record<string, unknown> };

    expect(tags.tags).toEqual(["Tags"]);
    expect(tags.responses).toHaveProperty("200");
    expect(places.tags).toEqual(["Locais"]);
    expect(places.responses).toHaveProperty("200");
  });

  test("o documento não descreve rota que não existe", () => {
    const document = apiOpenApiDocument(DECLARED_API_OPERATIONS);

    expect(Object.keys(document.paths).filter((path) => path.startsWith(ROTA_ANTIGA))).toEqual([]);
  });

  test("os tipos de texto livre aparecem no filtro da lista de artefatos e nos formatos de artefato", () => {
    const freeText = ["text", "news", "email_summary", "youtube_transcript"];

    expect(documentedOperations["GET /api/artifacts"].query?.type?.enum).toEqual(expect.arrayContaining(freeText));
    for (const schema of ["Artifact", "CreateArtifactRequest", "UpdateArtifactRequest"] as const) {
      const described = JSON.stringify(z.toJSONSchema(documentedSchemas[schema] as z.ZodType));
      for (const type of freeText) expect(described, `${schema}: ${type}`).toContain(`"${type}"`);
    }
  });

  test("describeOperation declara os parâmetros do caminho a partir do próprio caminho", () => {
    const operation = describeOperation("/api/artifacts/{artifactId}", documentedOperations["GET /api/artifacts/{artifactId}"]);

    expect(operation.parameters).toEqual([
      expect.objectContaining({ name: "artifactId", in: "path", required: true }),
    ]);
  });
});
