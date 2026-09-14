import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ModulesContainer } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/create-test-app";

let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Prefixo do controller que so existe no harness de teste. */
const TEST_ONLY_PREFIX = "/testing/";

function joinPath(...segments: string[]): string {
  const joined = segments.flatMap((segment) => segment.split("/")).filter(Boolean).join("/");
  return `/${joined}`.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * Le as rotas direto dos metadados que o Nest usa para registra-las, e nao de
 * uma lista mantida a mao: a lista a mao e justamente o que deixa uma rota
 * nova escapar do contrato.
 */
function registeredRoutes(target: TestApp): string[] {
  const routes = new Set<string>();
  for (const module of target.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
      if (!controller?.prototype) continue;
      const controllerPath = String(Reflect.getMetadata(PATH_METADATA, controller) ?? "");
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name as keyof typeof controller.prototype] as unknown;
        if (name === "constructor" || typeof handler !== "function") continue;
        const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (methodPath === undefined || method === undefined) continue;
        for (const path of Array.isArray(methodPath) ? methodPath : [methodPath]) {
          routes.add(`${RequestMethod[method].toLowerCase()} ${joinPath(controllerPath, path)}`);
        }
      }
    }
  }
  return [...routes].filter((route) => !route.split(" ")[1]!.startsWith(TEST_ONLY_PREFIX)).sort();
}

function documentedRoutes(paths: Record<string, Record<string, unknown>>): string[] {
  return Object.entries(paths).flatMap(([path, operations]) => Object.keys(operations).map((method) => `${method} ${path}`)).sort();
}

describe("API documentation", () => {
  it("publishes the OpenAPI contract and interactive Scalar reference", async () => {
    app = await createTestApp();

    const document = await fetch(`${app.url}/openapi.json`);
    expect(document.status).toBe(200);
    const openApi = (await document.json()) as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(openApi.openapi).toBe("3.1.1");
    const description = (openApi as unknown as { info: { description: string } }).info.description;
    for (const fragment of ["token_use", "`user`", "`signup`", "`guest`", "observes_user_id", "subj"]) expect(description).toContain(fragment);

    const reference = await fetch(`${app.url}/docs`);
    expect(reference.status).toBe(200);
    expect(reference.headers.get("content-type")).toContain("text/html");
    expect(await reference.text()).toContain("Braid Auth API");
  });

  it("documents every route Nest has registered, and nothing that is not registered", async () => {
    app = await createTestApp();
    const openApi = (await (await fetch(`${app.url}/openapi.json`)).json()) as { paths: Record<string, Record<string, unknown>> };

    const registered = registeredRoutes(app);
    const documented = documentedRoutes(openApi.paths);

    expect(registered.length).toBeGreaterThan(0);
    expect(registered.filter((route) => !documented.includes(route)), "registered but undocumented").toEqual([]);
    expect(documented.filter((route) => !registered.includes(route)), "documented but not registered").toEqual([]);
  });

  it("sees a route that exists only in the test harness, so the collector is not blind", async () => {
    app = await createTestApp();
    const all = new Set<string>();
    for (const module of app.app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype as { prototype?: object } | undefined;
        if (controller?.prototype) all.add(String(Reflect.getMetadata(PATH_METADATA, controller)));
      }
    }
    expect(all).toContain("testing");
  });
});
