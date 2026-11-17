import { expect, test, vi } from "vitest";
import { PhotonPlaceSearchGateway, toPlaceSuggestion } from "./photon-place-search.gateway";
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
  // Onde a pessoa esta nunca vai para o servico de mapas.
  expect(url.searchParams.has("lat")).toBe(false);
  expect(url.searchParams.has("lon")).toBe(false);
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
  expect(search).toHaveBeenCalledWith("padaria", 10);
});

test("the search hands the client only the text of each place", async () => {
  const search = vi.fn().mockResolvedValue([{ name: "Padaria", address: "Belo Horizonte", label: "Padaria, Belo Horizonte" }]);

  const places = await new SearchPlacesUseCase({ search }).execute({ query: "padaria" });

  expect(search).toHaveBeenCalledWith("padaria", 6);
  expect(places).toEqual([{ name: "Padaria", address: "Belo Horizonte", label: "Padaria, Belo Horizonte" }]);
});
