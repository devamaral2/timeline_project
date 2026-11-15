import type { ArtifactDto, EventArtifactDto } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  type DraftArtifact,
  addDraftArtifact,
  addFoodCopy,
  artifactLinkInputs,
  draftArtifactPositions,
  draftArtifactsFromEvent,
  moveDraftArtifact,
  removeDraftArtifact,
  sameArtifactLinks,
  setCopyQuantity,
} from "./event-artifact-draft";

function draft(id: string, relation: DraftArtifact["relation"] = "uses"): DraftArtifact {
  return { id, name: `Artefato ${id}`, type: "text", global: false, relation };
}

function artifact(id: string): ArtifactDto {
  return { id, name: `Artefato ${id}`, type: "text", global: false } as ArtifactDto;
}

describe("draftArtifactsFromEvent", () => {
  it("lê os artefatos do evento na ordem da API, com a relação de cada um", () => {
    const links = [
      { relation: "uses", fromRecurrence: false, artifact: { ...artifact("a"), global: true, type: "workout" } },
      { relation: "creates", fromRecurrence: false, artifact: artifact("b") },
    ] as EventArtifactDto[];

    expect(draftArtifactsFromEvent(links)).toEqual([
      { id: "a", name: "Artefato a", type: "workout", global: true, relation: "uses" },
      { id: "b", name: "Artefato b", type: "text", global: false, relation: "creates" },
    ]);
  });
});

describe("addDraftArtifact", () => {
  it("o artefato escolhido entra no fim, com a relação uses", () => {
    expect(addDraftArtifact([draft("a")], artifact("b"))).toEqual([draft("a"), { ...draft("b"), name: "Artefato b" }]);
  });

  it("um artefato que já está na lista não entra de novo", () => {
    expect(addDraftArtifact([draft("a")], artifact("a"))).toEqual([draft("a")]);
  });
});

describe("removeDraftArtifact", () => {
  it("tira só o artefato pedido, e a ordem do resto fica", () => {
    expect(removeDraftArtifact([draft("a"), draft("b"), draft("c")], "b")).toEqual([draft("a"), draft("c")]);
  });
});

describe("moveDraftArtifact", () => {
  it("sobe e desce trocando com o vizinho", () => {
    const list = [draft("a"), draft("b"), draft("c")];

    expect(moveDraftArtifact(list, "b", -1).map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(moveDraftArtifact(list, "b", 1).map((item) => item.id)).toEqual(["a", "c", "b"]);
  });

  it("no começo ou no fim, subir ou descer não faz nada", () => {
    const list = [draft("a"), draft("b")];

    expect(moveDraftArtifact(list, "a", -1)).toEqual(list);
    expect(moveDraftArtifact(list, "b", 1)).toEqual(list);
  });

  it("o que o evento criou não se mexe, e os de posição pulam por cima dele", () => {
    const list = [draft("a"), draft("created", "creates"), draft("b")];

    expect(moveDraftArtifact(list, "b", -1).map((item) => item.id)).toEqual(["b", "created", "a"]);
    expect(moveDraftArtifact(list, "created", -1).map((item) => item.id)).toEqual(["a", "created", "b"]);
  });
});

describe("draftArtifactPositions", () => {
  it("numera os de posição em ordem e deixa null o que o evento criou", () => {
    expect(draftArtifactPositions([draft("a"), draft("c", "creates"), draft("b")])).toEqual([1, null, 2]);
  });
});

describe("addFoodCopy e setCopyQuantity", () => {
  const food = { ...artifact("food-1"), type: "food", global: true } as ArtifactDto;

  it("o alimento escolhido entra no fim como cópia: copyOf é o original, a chave local é só da linha", () => {
    expect(addFoodCopy([draft("a")], food, "row-1")).toEqual([
      draft("a"),
      { id: "row-1", name: "Artefato food-1", type: "food", global: true, relation: "uses", copyOf: "food-1" },
    ]);
  });

  it("o mesmo alimento pode entrar de novo: cada entrada é uma cópia com a sua quantidade", () => {
    const once = addFoodCopy([], food, "row-1");
    const twice = addFoodCopy(once, food, "row-2");
    expect(twice.map((item) => item.copyOf)).toEqual(["food-1", "food-1"]);
  });

  it("a quantidade da cópia nova muda só essa linha", () => {
    const list = addFoodCopy(addFoodCopy([], food, "row-1"), food, "row-2");
    const next = setCopyQuantity(list, "row-2", "2 porções");
    expect(next.map((item) => item.quantity)).toEqual([undefined, "2 porções"]);
  });
});

describe("artifactLinkInputs e sameArtifactLinks", () => {
  it("uma cópia nova vai como copyOf e quantity, sem relação e sem id", () => {
    const list = setCopyQuantity(addFoodCopy([], { ...artifact("food-1"), type: "food", global: true } as ArtifactDto, "row-1"), "row-1", "150 g");
    expect(artifactLinkInputs(list)).toEqual([{ copyOf: "food-1", quantity: "150 g" }]);
  });

  it("uma cópia sem quantidade vai só com copyOf; uma quantidade só de espaços não vai", () => {
    const food = { ...artifact("food-1"), type: "food", global: true } as ArtifactDto;
    expect(artifactLinkInputs(addFoodCopy([], food, "row-1"))).toEqual([{ copyOf: "food-1" }]);
    expect(artifactLinkInputs(setCopyQuantity(addFoodCopy([], food, "row-1"), "row-1", "   "))).toEqual([{ copyOf: "food-1" }]);
  });

  it("uma cópia que já está no evento vai como id e relação, como qualquer artefato ligado", () => {
    const existing = { ...draft("copy-9"), type: "food" as const, quantity: "1 porção" };
    expect(artifactLinkInputs([existing])).toEqual([{ id: "copy-9", relation: "uses" }]);
  });

  it("o corpo leva id e relação, na ordem da lista", () => {
    expect(artifactLinkInputs([draft("b", "creates"), draft("a")])).toEqual([
      { id: "b", relation: "creates" },
      { id: "a", relation: "uses" },
    ]);
  });

  it("a mesma lista, na mesma ordem e com as mesmas relações, não é mudança", () => {
    expect(sameArtifactLinks([draft("a"), draft("b")], [draft("a"), draft("b")])).toBe(true);
    expect(sameArtifactLinks([draft("a"), draft("b")], [draft("b"), draft("a")])).toBe(false);
    expect(sameArtifactLinks([draft("a")], [draft("a", "updates")])).toBe(false);
    expect(sameArtifactLinks([draft("a")], [])).toBe(false);
  });

  it("uma cópia nova, ou uma quantidade mudada, é mudança", () => {
    const food = { ...artifact("food-1"), type: "food", global: true } as ArtifactDto;
    const base = addFoodCopy([], food, "row-1");
    expect(sameArtifactLinks(base, [])).toBe(false);
    expect(sameArtifactLinks(base, setCopyQuantity(base, "row-1", "2"))).toBe(false);
  });
});
