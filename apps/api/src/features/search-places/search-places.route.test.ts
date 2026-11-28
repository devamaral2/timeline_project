import { expect, test } from "vitest";
import type { PlaceSuggestionDto } from "@repo/contracts";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import type { FoundPlace, PlaceSearchGateway } from "../../infrastructure/places/photon-place-search.gateway";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { SearchPlacesUseCase } from "./search-places.usecase";
import { searchPlacesRoute } from "./search-places.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "auth-user-1" };

class StubPlaceSearch implements PlaceSearchGateway {
  calls: Array<{ query: string; limit: number }> = [];

  search(query: string, limit: number): Promise<FoundPlace[]> {
    this.calls.push({ query, limit });
    return Promise.resolve([{ name: query, address: "Rua Um, 1", label: `${query}, Rua Um, 1` }]);
  }
}

function appWith(gateway: PlaceSearchGateway) {
  const app = createFastifyInstance();
  registerApiRoutes(app, [searchPlacesRoute(new SearchPlacesUseCase(gateway))], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return app;
}

test("GET /api/places searches by the text and the requested limit, without sending where the person is", async () => {
  const places = new StubPlaceSearch();
  const app = appWith(places);

  const response = await app.inject({ method: "GET", url: "/api/places?query=ibirapuera&limit=3", headers: session });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual([{ name: "ibirapuera", address: "Rua Um, 1", label: "ibirapuera, Rua Um, 1" }]);
  expect(places.calls).toEqual([{ query: "ibirapuera", limit: 3 }]);
  await app.close();
});

test("defaults to six places and caps the limit at ten", async () => {
  const places = new StubPlaceSearch();
  const app = appWith(places);

  await app.inject({ method: "GET", url: "/api/places?query=ibirapuera", headers: session });
  await app.inject({ method: "GET", url: "/api/places?query=ibirapuera&limit=50", headers: session });
  await app.inject({ method: "GET", url: "/api/places?query=ibirapuera&limit=0", headers: session });

  expect(places.calls.map((call) => call.limit)).toEqual([6, 10, 6]);
  await app.close();
});

test("a query shorter than three letters is an empty list and never reaches the map service", async () => {
  const places = new StubPlaceSearch();
  const app = appWith(places);

  const response = await app.inject({ method: "GET", url: "/api/places?query=ib", headers: session });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body) as PlaceSuggestionDto[]).toEqual([]);
  expect(places.calls).toEqual([]);
  await app.close();
});

test("requires the gateway identity and refuses the device key", async () => {
  const app = appWith(new StubPlaceSearch());

  const anonymous = await app.inject({ method: "GET", url: "/api/places?query=ibirapuera" });
  expect(anonymous.statusCode).toBe(401);

  const device = await app.inject({
    method: "GET",
    url: "/api/places?query=ibirapuera",
    headers: { ...session, "x-auth-permissions": "transcription:work" },
  });
  expect(device.statusCode).toBe(403);
  await app.close();
});
