import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  documentedOperations,
  documentedSchemas,
  documentedTags,
  type OperationDoc,
  type QueryDoc,
  type SchemaName,
} from "../common/openapi-operations";

type JsonObject = Record<string, unknown>;

const METHODS = ["get", "post", "patch", "put", "delete"] as const;

const ref = (name: SchemaName) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: JsonObject) => ({ "application/json": { schema } });
const errorResponse = (description: string) => ({ description, content: jsonContent(ref("Error")) });

function queryParameter(name: string, doc: QueryDoc): JsonObject {
  return {
    name,
    in: "query",
    required: doc.required ?? false,
    description: doc.description,
    schema: {
      type: doc.type ?? "string",
      ...(doc.format ? { format: doc.format } : {}),
      ...(doc.enum ? { enum: [...doc.enum] } : {}),
      ...(doc.minimum === undefined ? {} : { minimum: doc.minimum }),
      ...(doc.maximum === undefined ? {} : { maximum: doc.maximum }),
      ...(doc.default === undefined ? {} : { default: doc.default }),
    },
  };
}

const idempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description: "Reenviar a mesma chave com o mesmo corpo devolve a resposta já dada, sem criar de novo.",
  schema: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,128}$" },
};

function responsesOf(doc: OperationDoc): JsonObject {
  const { status, description, schema, list } = doc.success;
  const body = schema ? (list ? { type: "array", items: ref(schema) } : ref(schema)) : undefined;
  const responses: JsonObject = { [status]: body ? { description, content: jsonContent(body) } : { description } };
  for (const [code, text] of Object.entries(doc.errors ?? {})) responses[code] = errorResponse(text);
  responses["401"] = errorResponse("Falta a chave do gateway ou o usuário.");
  responses["403"] = errorResponse("A chave do gateway não confere, ou o recurso é de outro usuário.");
  return responses;
}

/**
 * O Swagger so enxerga os controllers que ainda estao no Nest. As operacoes
 * declarativas do Fastify entram no mesmo documento a partir do catalogo, para
 * que `/openapi.json` continue listando todas as rotas da API.
 */
function ensureDocumentedPaths(document: OpenAPIObject): void {
  if (!document.paths) document.paths = {};
  const paths = document.paths as unknown as Record<string, Record<string, JsonObject>>;
  for (const key of Object.keys(documentedOperations)) {
    const [method, path] = key.split(" ");
    if (!method || !path) continue;
    paths[path] ??= {};
    paths[path][method.toLowerCase()] ??= {};
  }
}

/**
 * Completa o documento que o Swagger gera dos controllers com o que esta no
 * catalogo: grupo, resumo, filtros opcionais, corpo e resposta. Uma rota fora do
 * catalogo fica como o Swagger a gerou; o teste deste arquivo impede que isso
 * aconteca sem ninguem ver.
 */
export function describeOperations(document: OpenAPIObject): OpenAPIObject {
  ensureDocumentedPaths(document);
  const paths = document.paths as unknown as Record<string, Record<string, JsonObject>>;
  for (const [path, item] of Object.entries(paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      const doc = documentedOperations[`${method.toUpperCase()} ${path}`];
      if (!operation || !doc) continue;

      const generatedPathParameters = ((operation.parameters as JsonObject[] | undefined) ?? [])
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => ({ ...parameter, description: "O id que a criação ou a listagem devolveu." }));
      const declaredPathParameters = [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
        name,
        in: "path",
        required: true,
        description: "O id que a criação ou a listagem devolveu.",
        schema: { type: "string" },
      }));
      const pathParameters = generatedPathParameters.length > 0 ? generatedPathParameters : declaredPathParameters;
      const query = Object.entries(doc.query ?? {}).map(([name, queryDoc]) => queryParameter(name, queryDoc));


      operation.tags = [doc.tag];
      operation.summary = doc.summary;
      if (doc.description) operation.description = doc.description;
      operation.parameters = [...pathParameters, ...query, ...(doc.idempotent ? [idempotencyHeader] : [])];
      if (doc.body) operation.requestBody = { required: true, content: jsonContent(ref(doc.body)) };
      operation.responses = responsesOf(doc);
    }
  }

  const schemas: Record<string, JsonObject> = {};
  for (const [name, schema] of Object.entries(documentedSchemas)) {
    const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { target: "openapi-3.0", io: "input", unrepresentable: "any" });
    schemas[name] = jsonSchema;
  }
  document.components = { ...document.components, schemas: { ...document.components?.schemas, ...schemas } as never };
  document.tags = documentedTags.map((tag) => ({ ...tag }));
  return document;
}

/** Gera o documento OpenAPI a partir dos controllers e serve a referência interativa em `/docs`, como no Auth. */
export function configureApiDocumentation(app: INestApplication): void {
  // A API nao aceita bearer: quem chama e o gateway Auth, que encaminha a chave interna e o usuario ja validado.
  const config = new DocumentBuilder()
    .setTitle("Braid API")
    .setDescription("Backend de tarefas, artefatos, séries e pedidos ao agente. Só o gateway Auth chega aqui, com os dois headers abaixo.")
    .addApiKey({ type: "apiKey", in: "header", name: "x-auth-gateway-key" }, "gateway-key")
    .addApiKey({ type: "apiKey", in: "header", name: "x-auth-user-id" }, "user-id")
    .addSecurityRequirements({ "gateway-key": [], "user-id": [] })
    .build();
  const document = describeOperations(SwaggerModule.createDocument(app, config));

  const express = app.getHttpAdapter().getInstance() as {
    get(path: string, handler: (request: Request, response: Response) => void): void;
    use(path: string, handler: (request: Request, response: Response) => void): void;
  };
  express.get("/openapi.json", (_request, response) => response.json(document));
  express.use("/docs", apiReference({
    pageTitle: "Braid API",
    theme: "purple",
    darkMode: false,
    spec: { content: document },
  }) as unknown as (request: Request, response: Response) => void);
}
