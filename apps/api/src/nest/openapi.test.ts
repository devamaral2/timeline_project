import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";
import { expect, test } from "vitest";
import { z } from "zod";
import { AppModule } from "../app.module";
import type { ApiRuntime } from "../server/composition-root";
import { describeOperations } from "./openapi";
import { documentedOperations, documentedSchemas, documentedTags } from "../common/openapi-operations";
import { DECLARED_API_OPERATIONS, declaredOperationKey } from "../server/declared-operations";

const ROTA_ANTIGA = "/api/events"; // a rota antiga: o catálogo não pode tê-la
type ModuleLike = (new (...args: never[]) => unknown) | { module: ModuleLike; imports?: ModuleLike[]; controllers?: ControllerClass[] };
type ControllerClass = new (...args: never[]) => unknown;

/** Toda rota que o Nest registra, como `METODO /caminho` na forma do OpenAPI. */
function routesOf(root: ModuleLike): string[] {
  const routes = new Set<string>();
  const seen = new Set<unknown>();
  const visit = (entry: ModuleLike): void => {
    const moduleClass = typeof entry === "function" ? entry : entry.module;
    if (typeof entry === "function" && seen.has(entry)) return;
    seen.add(entry);
    const dynamic: { imports?: ModuleLike[]; controllers?: ControllerClass[] } = typeof entry === "function" ? {} : entry;
    const controllers = [...(Reflect.getMetadata("controllers", moduleClass) ?? []), ...(dynamic.controllers ?? [])] as ControllerClass[];
    for (const controller of controllers) {
      const base = String(Reflect.getMetadata("path", controller) ?? "");
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name] as object;
        const method = Reflect.getMetadata("method", handler) as RequestMethod | undefined;
        if (name === "constructor" || method === undefined) continue;
        const path = [base, String(Reflect.getMetadata("path", handler) ?? "")]
          .flatMap((part) => part.split("/"))
          .filter(Boolean)
          .map((part) => (part.startsWith(":") ? `{${part.slice(1)}}` : part))
          .join("/");
        routes.add(`${RequestMethod[method]} /${path}`);
      }
    }
    const imports = [...(Reflect.getMetadata("imports", moduleClass) ?? []), ...(dynamic.imports ?? [])] as ModuleLike[];
    for (const imported of imports) visit(imported);
  };
  visit(root);
  return [...routes].sort();
}

test("toda rota da API está no catálogo, e o catálogo não descreve rota que não existe", () => {
  const declared = DECLARED_API_OPERATIONS.map(declaredOperationKey);
  const module = AppModule.forRoot({} as ApiRuntime);
  expect(Object.keys(documentedOperations).sort()).toEqual([...routesOf(module as unknown as ModuleLike), ...declared].sort());
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

/** O que o Swagger gera sozinho de um controller: tag pelo nome da classe, filtros obrigatorios, nenhum corpo. */
function generated(): OpenAPIObject {
  return {
    openapi: "3.0.0",
    info: { title: "Braid API", version: "1.0.0" },
    paths: {
      "/api/tasks": {
        get: {
          tags: ["ListAgendaTasks"],
          parameters: [{ name: "from", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "" } },
        },
        post: { tags: ["CreateTask"], parameters: [], responses: { "201": { description: "" } } },
      },
      "/api/tasks/{taskId}": {
        patch: {
          tags: ["UpdateTask"],
          parameters: [{ name: "taskId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "" } },
        },
      },
      "/fora/do/catalogo": { get: { tags: ["Outro"], responses: { "200": { description: "" } } } },
    },
  } as unknown as OpenAPIObject;
}

test("o documento ganha grupo, resumo, filtros opcionais, corpo e resposta", () => {
  const document = describeOperations(generated()) as unknown as {
    tags: Array<{ name: string }>;
    components: { schemas: Record<string, Record<string, unknown>> };
    paths: Record<string, Record<string, {
      tags: string[]; summary?: string; requestBody?: unknown; responses: Record<string, { content?: unknown }>;
      parameters: Array<{ name: string; in: string; required: boolean; schema: Record<string, unknown> }>;
    }>>;
  };

  const list = document.paths["/api/tasks"].get;
  expect(list.tags).toEqual(["Tarefas"]);
  expect(list.summary).toBe("Lista a agenda, em páginas");
  expect(list.parameters.map((parameter) => parameter.name)).toEqual(["from", "to", "actor", "kind", "tag", "cursor", "limit"]);
  expect(list.parameters.every((parameter) => !parameter.required)).toBe(true);
  expect(list.parameters.find((parameter) => parameter.name === "actor")?.schema.enum).toEqual(["human", "agent"]);
  expect(list.responses["200"].content).toEqual({ "application/json": { schema: { $ref: "#/components/schemas/AgendaPage" } } });
  expect(Object.keys(list.responses)).toEqual(expect.arrayContaining(["200", "400", "401", "403"]));

  const create = document.paths["/api/tasks"].post;
  expect(create.requestBody).toEqual({ required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateTaskInput" } } } });
  expect(create.parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual(["header:Idempotency-Key"]);

  const update = document.paths["/api/tasks/{taskId}"].patch;
  expect(update.parameters.map((parameter) => `${parameter.in}:${parameter.name}`)).toEqual(["path:taskId"]);
  expect(update.responses["204"].content).toBeUndefined();
  expect(Object.keys(update.responses)).toEqual(expect.arrayContaining(["404", "409"]));

  expect(document.tags.map((tag) => tag.name)).toEqual(documentedTags.map((tag) => tag.name));
  expect(Object.keys(document.components.schemas).sort()).toEqual(Object.keys(documentedSchemas).sort());
  // O id vem do caminho, nao do corpo.
  expect(document.components.schemas.UpdateTaskInput.properties).not.toHaveProperty("taskId");
  expect(document.components.schemas.UpdateTaskInput.required).toEqual(["expectedRevision"]);

  // A rota antiga não existe: nem no catálogo, nem no documento.
  expect(Object.keys(documentedOperations).filter((route) => route.includes(ROTA_ANTIGA))).toEqual([]);
  expect(Object.keys(document.paths).filter((path) => path.startsWith(ROTA_ANTIGA))).toEqual([]);

  expect(document.paths["/fora/do/catalogo"].get.tags).toEqual(["Outro"]);
});

test("as operações que já respondem pelo Fastify entram no documento a partir do catálogo", () => {
  const document = describeOperations({
    openapi: "3.0.0",
    info: { title: "Braid API", version: "1.0.0" },
    paths: {},
  } as unknown as OpenAPIObject) as unknown as {
    paths: Record<string, Record<string, {
      tags: string[];
      parameters: Array<{ name: string; in: string; required: boolean }>;
      requestBody?: unknown;
      responses: Record<string, unknown>;
    }>>;
  };

  const update = document.paths["/api/tasks/{taskId}"].patch;
  expect(update.tags).toEqual(["Tarefas"]);
  expect(update.parameters).toEqual([
    expect.objectContaining({ name: "taskId", in: "path", required: true }),
  ]);
  expect(update.requestBody).toBeDefined();
  expect(update.responses).toHaveProperty("204");

  const create = document.paths["/api/tasks"].post;
  expect(create.parameters).toEqual([expect.objectContaining({ name: "Idempotency-Key", in: "header" })]);
  expect(create.responses).toHaveProperty("201");
  expect(document.paths["/api/projects"].post.responses).toHaveProperty("201");
});

test("os tipos de texto livre aparecem no filtro da lista de artefatos e nos formatos de artefato", () => {
  const freeText = ["text", "news", "email_summary", "youtube_transcript"];

  expect(documentedOperations["GET /api/artifacts"].query?.type?.enum).toEqual(expect.arrayContaining(freeText));
  for (const schema of ["Artifact", "CreateArtifactRequest", "UpdateArtifactRequest"] as const) {
    const described = JSON.stringify(z.toJSONSchema(documentedSchemas[schema] as z.ZodType));
    for (const type of freeText) expect(described, `${schema}: ${type}`).toContain(`"${type}"`);
  }
});
