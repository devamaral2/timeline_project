// @vitest-environment node
import { NextRequest } from "next/server";
import { expect, test } from "vitest";
import { proxy } from "./proxy";

function forwardedAuthorization(response: Response): string | null {
  // O Next sinaliza os headers reescritos com o prefixo x-middleware-request-.
  return response.headers.get("x-middleware-request-authorization");
}

test("turns the access cookie into a bearer for the Nest API", () => {
  const request = new NextRequest("http://web.test/api/events", { headers: { cookie: "braid_access=access-1" } });

  expect(forwardedAuthorization(proxy(request))).toBe("Bearer access-1");
});

test("drops an Authorization header the browser sent on its own", () => {
  const request = new NextRequest("http://web.test/api/events", { headers: { authorization: "Bearer forged" } });

  const response = proxy(request);

  expect(forwardedAuthorization(response)).toBeNull();
  expect(response.headers.get("x-middleware-override-headers")).not.toContain("authorization");
});

test("leaves the session route handlers alone", () => {
  const request = new NextRequest("http://web.test/api/session/refresh", { headers: { cookie: "braid_access=access-1" } });

  expect(forwardedAuthorization(proxy(request))).toBeNull();
});
