import { describe, expect, test, vi } from "vitest";
import type { FoundPlace } from "../../../infrastructure/places/photon-place-search.gateway";
import { distanceKm, namesPlace, pickPlace, PlaceResolver } from "./place-resolver.service";

const BELO_HORIZONTE = { latitude: -19.92, longitude: -43.94 };

const place = (label: string, point?: { latitude: number; longitude: number }): FoundPlace => ({
  name: label.split(",")[0] ?? label, address: "", label, ...(point ? { point } : {}),
});

const SANTO_AGOSTINHO = place("Hospital Mater Dei Santo Agostinho, Rua Gonçalves Dias 3155, Belo Horizonte", { latitude: -19.93, longitude: -43.95 });
const FEIRA_DE_SANTANA = { latitude: -12.25, longitude: -38.95 };
const FEIRA = place("Hospital Mater Dei, Avenida João Durval Carneiro, Feira de Santana, Bahia", FEIRA_DE_SANTANA);

describe("o local achado e o que a pessoa disse", () => {
  test("toda palavra dita aparece no local, sem depender de acento, caixa ou preposicao", () => {
    expect(namesPlace("clínica da saúde emocional", place("Clinica Saude Emocional, Rua Um, Contagem"))).toBe(true);
    expect(namesPlace("hospital mater dei betim", place("Hospital Mater Dei Betim Contagem, Via Expressa, Betim"))).toBe(true);
  });

  test("um local que so parece com o que foi dito nao serve", () => {
    expect(namesPlace("clinica saude emocional", place("Clínica Saúde VR, Rua Oito de Dezembro 32, Matozinhos"))).toBe(false);
    expect(namesPlace("clinica saude emocional", place("Clínica Equilíbrio Emocional, Patos de Minas"))).toBe(false);
    expect(namesPlace("rua da bahia 1148", place("Observatório da Diversidade Cultural, Rua da Bahia, Belo Horizonte"))).toBe(false);
    expect(namesPlace("de da", place("Rua da Bahia"))).toBe(false);
  });
});

describe("escolha do local", () => {
  test("mede a distancia entre dois pontos", () => {
    expect(distanceKm(BELO_HORIZONTE, BELO_HORIZONTE)).toBe(0);
    // Belo Horizonte a Feira de Santana: cerca de mil quilometros.
    expect(Math.round(distanceKm(BELO_HORIZONTE, FEIRA_DE_SANTANA) / 100)).toBe(10);
  });

  test("um local perto da pessoa ganha de um de longe, mesmo que o mapa liste o de longe antes", () => {
    expect(pickPlace("hospital mater dei", [FEIRA, SANTO_AGOSTINHO], BELO_HORIZONTE)).toBe(SANTO_AGOSTINHO);
  });

  test("sem nenhum perto, vale o de longe; sem saber onde a pessoa esta, o primeiro do mapa", () => {
    expect(pickPlace("hospital mater dei", [FEIRA], BELO_HORIZONTE)).toBe(FEIRA);
    expect(pickPlace("hospital mater dei", [FEIRA, SANTO_AGOSTINHO])).toBe(FEIRA);
  });

  test("nenhum local que bata com o que foi dito: nada e escolhido", () => {
    expect(pickPlace("clinica saude emocional", [place("Clínica Saúde VR, Matozinhos", BELO_HORIZONTE)], BELO_HORIZONTE)).toBeUndefined();
  });
});

describe("do lugar dito ao endereco", () => {
  test("procura perto da pessoa e devolve o endereco do lugar que existe", async () => {
    const search = vi.fn().mockResolvedValue([FEIRA, SANTO_AGOSTINHO]);

    const location = await new PlaceResolver({ search }).resolve("  Hospital Mater Dei ", BELO_HORIZONTE);

    expect(search).toHaveBeenCalledWith("Hospital Mater Dei", 8, BELO_HORIZONTE);
    expect(location).toBe(SANTO_AGOSTINHO.label);
  });

  test("sem lugar que bata, com o mapa fora do ar ou com texto curto demais, fica o que a pessoa disse", async () => {
    const unknown = new PlaceResolver({ search: vi.fn().mockResolvedValue([place("Clínica Saúde VR, Matozinhos")]) });
    expect(await unknown.resolve("clínica saúde emocional")).toBe("clínica saúde emocional");

    const down = new PlaceResolver({ search: vi.fn().mockRejectedValue(new Error("down")) });
    expect(await down.resolve("clínica saúde emocional")).toBe("clínica saúde emocional");

    const search = vi.fn();
    expect(await new PlaceResolver({ search }).resolve("bh")).toBe("bh");
    expect(search).not.toHaveBeenCalled();
  });
});
