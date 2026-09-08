import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import type { Request, Response } from "express";

/** Gera o documento OpenAPI a partir dos controllers e serve a referência interativa em `/docs`, como no Auth. */
export function configureApiDocumentation(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Braid API")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

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
  }));
}
