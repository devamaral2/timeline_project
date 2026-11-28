import { z } from "zod";
import {
  documentedOperations,
  documentedSchemas,
  documentedTags,
  type OperationDoc,
  type QueryDoc,
  type SchemaName,
} from "../common/openapi-operations";
import type { ApiRouteOperation } from "../http/api-route";
import { declaredOperationKey } from "./declared-operations";

/**
 * O documento OpenAPI da API sai da lista de operacoes que o servidor registrou
 * mais o catalogo de descricoes; nenhuma rota e descoberta por metadata ou
 * reflection. Uma operacao registrada sem entrada no catalogo impede o
 * documento de ser construido, e o teste de paridade acusa as duas direcoes.
 */

type JsonObject = Record<string, unknown>;

export interface ApiOpenApiDocument {
  openapi: string;
  info: { title: string; description: string; version: string };
  paths: Record<string, Record<string, JsonObject>>;
  components: { securitySchemes: Record<string, JsonObject>; schemas: Record<string, JsonObject> };
  security: JsonObject[];
  tags: JsonObject[];
}

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

function pathParameters(path: string): JsonObject[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: "path",
    required: true,
    description: "O id que a criação ou a listagem devolveu.",
    schema: { type: "string" },
  }));
}

/** A operacao do documento: grupo, resumo, filtros opcionais, corpo e resposta do catalogo. */
export function describeOperation(path: string, doc: OperationDoc): JsonObject {
  const query = Object.entries(doc.query ?? {}).map(([name, queryDoc]) => queryParameter(name, queryDoc));
  const operation: JsonObject = {
    tags: [doc.tag],
    summary: doc.summary,
    parameters: [...pathParameters(path), ...query, ...(doc.idempotent ? [idempotencyHeader] : [])],
    responses: responsesOf(doc),
  };
  if (doc.description) operation.description = doc.description;
  if (doc.body) operation.requestBody = { required: true, content: jsonContent(ref(doc.body)) };
  return operation;
}

/** O documento OpenAPI das operacoes registradas, na ordem em que o servidor as registrou. */
export function apiOpenApiDocument(operations: readonly ApiRouteOperation[]): ApiOpenApiDocument {
  const paths: Record<string, Record<string, JsonObject>> = {};
  for (const operation of operations) {
    const key = declaredOperationKey(operation);
    const doc = documentedOperations[key];
    if (!doc) throw new Error(`A operacao ${key} esta registrada mas nao esta documentada no catalogo OpenAPI`);
    const path = key.slice(operation.method.length + 1);
    paths[path] ??= {};
    paths[path][operation.method.toLowerCase()] = describeOperation(path, doc);
  }

  const schemas: Record<string, JsonObject> = {};
  for (const [name, schema] of Object.entries(documentedSchemas)) {
    const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, {
      target: "openapi-3.0",
      io: "input",
      unrepresentable: "any",
    });
    schemas[name] = jsonSchema;
  }

  return {
    openapi: "3.0.0",
    info: {
      title: "Braid API",
      description:
        "Backend de tarefas, artefatos, séries e pedidos ao agente. Só o gateway Auth chega aqui, com os dois headers abaixo.",
      version: "1.0.0",
    },
    paths,
    components: {
      // A API nao aceita bearer: quem chama e o gateway Auth, que encaminha a chave interna e o usuario ja validado.
      securitySchemes: {
        "gateway-key": { type: "apiKey", in: "header", name: "x-auth-gateway-key" },
        "user-id": { type: "apiKey", in: "header", name: "x-auth-user-id" },
      },
      schemas,
    },
    security: [{ "gateway-key": [], "user-id": [] }],
    tags: documentedTags.map((tag) => ({ ...tag })),
  };
}

/**
 * A pagina da referencia interativa do documento, pelo renderer do Scalar. O
 * pacote e ESM: o processo da API continua CommonJS, entao ele entra por import
 * dinamico, uma vez por servidor.
 */
export async function apiDocumentationHtml(document: ApiOpenApiDocument): Promise<string> {
  const { DEFAULT_CDN, renderApiReference } = await import("@scalar/client-side-rendering");
  return renderApiReference({
    config: { theme: "purple", darkMode: false, content: document },
    pageTitle: "Braid API",
    cdn: DEFAULT_CDN,
  });
}

let cache: { signature: string; document: ApiOpenApiDocument; html: string } | undefined;

/**
 * O documento e a pagina da mesma lista de rotas, construidos uma vez por
 * servidor: os testes sobem varios Fastify, cada um com as suas rotas.
 */
export async function documentationFor(
  operations: readonly ApiRouteOperation[],
): Promise<{ document: ApiOpenApiDocument; html: string }> {
  const signature = operations.map(declaredOperationKey).join("|");
  if (cache?.signature !== signature) {
    const document = apiOpenApiDocument(operations);
    cache = { signature, document, html: await apiDocumentationHtml(document) };
  }
  return cache;
}
