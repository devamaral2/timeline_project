import "reflect-metadata";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { expect, test } from "vitest";
import { FirebaseAuthGuard } from "../../auth/firebase-auth.guard";
import { EventsController } from "./events.controller";

/** Caminho declarado em cada handler, na ordem em que os metodos aparecem na classe. */
function declaredPaths(): string[] {
  const prototype = EventsController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== "constructor")
    .map((name) => Reflect.getMetadata(PATH_METADATA, prototype[name] as object) as string)
    .filter((path): path is string => typeof path === "string");
}

/**
 * O Nest casa rotas na ordem de declaracao. Se `:eventId` for declarado antes de
 * `daily`, `ai` ou `voice`, o parametro dinamico captura as tres e elas passam a
 * responder um GetEvent com eventId="daily". O roteamento por arquivo do Next
 * escondia esse risco; aqui ele fica travado.
 */
test("declares the static event routes before the dynamic :eventId route", () => {
  const paths = declaredPaths();
  const dynamicIndex = paths.indexOf(":eventId");

  expect(dynamicIndex).toBeGreaterThan(-1);
  for (const staticPath of ["daily", "ai", "voice"]) {
    expect(paths.indexOf(staticPath)).toBeGreaterThan(-1);
    expect(paths.indexOf(staticPath)).toBeLessThan(dynamicIndex);
  }
});

/**
 * Leituras publicas ficaram para tras: timeline e daily overview agora exigem
 * o ator do Firebase, como o resto das rotas.
 */
test.each(["list", "daily"])("requires FirebaseAuthGuard on %s", (methodName) => {
  const guards = Reflect.getMetadata(
    GUARDS_METADATA,
    (EventsController.prototype as unknown as Record<string, object>)[methodName],
  ) as unknown[] | undefined;

  expect(guards).toContain(FirebaseAuthGuard);
});
