import type { INestApplication } from "@nestjs/common";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { Request, Response } from "express";
import { authOpenApiDocument } from "../http/openapi";

/** Adaptador temporario do Nest/Express para publicar o documento estatico. */
export function configureApiDocumentation(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as {
    get(path: string, handler: (request: Request, response: Response) => void): void;
    use(path: string, handler: (request: Request, response: Response) => void): void;
  };
  express.get("/openapi.json", (_request, response) => response.json(authOpenApiDocument));
  express.use(
    "/docs",
    apiReference({
      pageTitle: "Braid Auth API",
      theme: "purple",
      darkMode: false,
      spec: { content: authOpenApiDocument },
    }),
  );
}
