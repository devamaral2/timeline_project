import { expect, test, vi } from "vitest";
import { PhotonPlaceReverseGateway, PhotonPlaceSearchGateway, reverseUrl, toPlaceSuggestion } from "./photon-place-search.gateway";
import { nearPoint } from "../../features/search-places/search-places.controller";
import { SearchPlacesUseCase } from "../../features/search-places/search-places.usecase";

test("builds the label from the place name and the rest of the address", () => {
  expect(
    toPlaceSuggestion({
      properties: { name: "Parque Ibirapuera", street: "Avenida Pedro Álvares Cabral", district: "Vila Mariana", city: "São Paulo", state: "São Paulo", country: "Brasil" },
    }),
  ).toEqual({
    name: "Parque Ibirapuera",
    address: "Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo, São Paulo, Brasil",
    label: "Parque Ibirapuera, Avenida Pedro Álvares Cabral, Vila Mariana, São Paulo, São Paulo, Brasil",
  });
});

test("uses the street and number as the name when the place has none", () => {
  expect(toPlaceSuggestion({ properties: { street: "Rua Augusta", housenumber: "100", city: "São Paulo" } })).toMatchObject({
    name: "Rua Augusta 100",
    address: "São Paulo",
  });
  expect(toPlaceSuggestion({ properties: {} })).toBeUndefined();
});

test("asks the map service for the text and drops repeated places", async () => {
  const feature = { properties: { name: "Padaria", city: "Campinas" } };
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature, feature, { properties: {} }] }) });
  const gateway = new PhotonPlaceSearchGateway("https://maps.example/api/", fetchImpl as unknown as typeof fetch);

  const places = await gateway.search("padaria", 5);

  expect(places).toEqual([{ name: "Padaria", address: "Campinas", label: "Padaria, Campinas" }]);
  const url = fetchImpl.mock.calls[0][0] as URL;
  expect(url.searchParams.get("q")).toBe("padaria");
  expect(url.searchParams.get("limit")).toBe("5");
});

test("an unreachable or failing map service gives an empty list", async () => {
  const down = new PhotonPlaceSearchGateway("https://maps.example/api/", vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch);
  const failing = new PhotonPlaceSearchGateway("https://maps.example/api/", vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch);
  expect(await down.search("padaria", 5)).toEqual([]);
  expect(await failing.search("padaria", 5)).toEqual([]);
});

test("does not search for fewer than three letters and caps the limit", async () => {
  const search = vi.fn().mockResolvedValue([]);
  const useCase = new SearchPlacesUseCase({ search });
  expect(await useCase.execute({ query: " pa " })).toEqual([]);
  expect(search).not.toHaveBeenCalled();
  await useCase.execute({ query: "padaria", limit: 500 });
  expect(search).toHaveBeenCalledWith("padaria", 10, undefined);
});

test("reverse geocoding asks /reverse with the coordinates and returns the address", async () => {
  const feature = { properties: { name: "Padaria", city: "Campinas" } };
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
  const gateway = new PhotonPlaceReverseGateway("https://maps.example/api/", fetchImpl as unknown as typeof fetch);

  const place = await gateway.reverse({ latitude: -22.9, longitude: -47.06 });

  expect(place?.label).toBe("Padaria, Campinas");
  const url = fetchImpl.mock.calls[0][0] as URL;
  // Ao lado de `/api`, nao dentro: `/api/reverse` responde 404 no Photon.
  expect(url.pathname).toBe("/reverse");
  expect(url.searchParams.get("lat")).toBe("-22.9");
  expect(url.searchParams.get("lon")).toBe("-47.06");
});

test("reverse geocoding failures give no address", async () => {
  const down = new PhotonPlaceReverseGateway("https://maps.example/api/", vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch);
  expect(await down.reverse({ latitude: 0, longitude: 0 })).toBeUndefined();
});

test("the reverse endpoint sits beside the search endpoint", () => {
  expect(reverseUrl("https://photon.komoot.io/api/").href).toBe("https://photon.komoot.io/reverse");
  expect(reverseUrl("https://photon.komoot.io/api").href).toBe("https://photon.komoot.io/reverse");
  expect(reverseUrl("https://maps.example/photon/api/").href).toBe("https://maps.example/photon/reverse");
  expect(reverseUrl("https://maps.example/").href).toBe("https://maps.example/reverse");
});

test("with the person's position, the map service weighs distance and each place carries its point", async () => {
  const feature = { geometry: { coordinates: [-43.95, -19.93] }, properties: { name: "Padaria Brasil", city: "Belo Horizonte" } };
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature] }) });
  const gateway = new PhotonPlaceSearchGateway("https://maps.example/api/", fetchImpl as unknown as typeof fetch);

  const places = await gateway.search("padaria", 5, { latitude: -19.92, longitude: -43.94 });

  const url = fetchImpl.mock.calls[0][0] as URL;
  expect(url.searchParams.get("lat")).toBe("-19.92");
  expect(url.searchParams.get("lon")).toBe("-43.94");
  // GeoJSON traz a longitude primeiro.
  expect(places[0]?.point).toEqual({ latitude: -19.93, longitude: -43.95 });
});

test("the search passes the position on and hands the client only the text of each place", async () => {
  const near = { latitude: -19.92, longitude: -43.94 };
  const search = vi.fn().mockResolvedValue([
    { name: "Padaria", address: "Belo Horizonte", label: "Padaria, Belo Horizonte", point: { latitude: -19.93, longitude: -43.95 } },
  ]);

  const places = await new SearchPlacesUseCase({ search }).execute({ query: "padaria", near });

  expect(search).toHaveBeenCalledWith("padaria", 6, near);
  expect(places).toEqual([{ name: "Padaria", address: "Belo Horizonte", label: "Padaria, Belo Horizonte" }]);
});

test("a position only counts when both coordinates are numbers inside the globe", () => {
  expect(nearPoint("-19.92", "-43.94")).toEqual({ latitude: -19.92, longitude: -43.94 });
  expect(nearPoint("-19.92", undefined)).toBeUndefined();
  expect(nearPoint("", "")).toBeUndefined();
  expect(nearPoint("norte", "-43.94")).toBeUndefined();
  expect(nearPoint("-91", "-43.94")).toBeUndefined();
  expect(nearPoint("-19.92", "181")).toBeUndefined();
});
