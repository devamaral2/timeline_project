import { describe, expect, it } from "vitest";
import { Artifact } from "../../domain";
import { RouterArtifactsReconciler, jevRouterArtifacts } from "./jev-router-artifacts";

function setup(owner: string | null = "owner", specs = jevRouterArtifacts) {
  const stored: Artifact[] = [];
  const artifacts = {
    async save(artifact: Artifact) { stored.push(artifact); },
    async update(artifact: Artifact) { stored.splice(stored.findIndex((item) => item.id === artifact.id), 1, artifact); },
    async listByUserId(userId: string) { return stored.filter((artifact) => artifact.userId === userId); },
  };
  return { stored, reconciler: new RouterArtifactsReconciler(artifacts, () => owner ?? undefined, specs) };
}

describe("jevRouterArtifacts", () => {
  it("writes one artifact per JEV with its parameters and questions", () => {
    const specs = jevRouterArtifacts();
    expect(specs.map((spec) => spec.name)).toEqual(["JEV · Despacho", "JEV · Vínculo", "JEV · Candidatas de edição"]);
    expect(specs[0]?.body).toContain("Certeza mínima: 0.92");
    expect(specs[0]?.body).toContain("### `task_create`");
    expect(specs[1]?.body).toContain("Máximo de candidatas");
  });
});

describe("RouterArtifactsReconciler", () => {
  it("creates router artifacts owned by the owner, once", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync();
    await reconciler.sync();
    expect(stored.map((artifact) => [artifact.type, artifact.userId])).toEqual([["router", "owner"], ["router", "owner"], ["router", "owner"]]);
    expect(stored[0]?.tags).toEqual(["router", "jev", "despacho"]);
  });

  it("rewrites the text when the config changed", async () => {
    let body = "um";
    const spec = () => [{ name: "JEV · X", body, tags: ["jev"] }];
    const { reconciler, stored } = setup("owner", spec);
    await reconciler.sync();
    body = "dois";
    await reconciler.sync();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.data).toEqual({ body: "dois" });
  });

  it("does nothing without an owner", async () => {
    const { reconciler, stored } = setup(null);
    await reconciler.sync();
    expect(stored).toHaveLength(0);
  });
});
