import { describe, expect, it } from "vitest";

import { selectRenderableMasterMoldBodies } from "./masterMoldViewportAdapter";
import type { MasterToolingSetState } from "./masterMold.contracts";
import type { MasterToolingSet } from "./engine/contracts";

function piece(index: number) {
  return {
    pieceId: `piece-${index}`,
    name: `Tooling Piece ${index}`,
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    volumeMm3: 10,
    triangleCount: 1,
    watertight: true,
    manifold: true,
    releaseDirection: "+Z" as const,
    regions: [],
    toolingRegistrationFeatureIds: [],
    fitsBuildVolume: true,
  };
}

function setFor(id: string, pieces: number): MasterToolingSet {
  return {
    moldPartId: id,
    moldPartName: `Mold ${id}`,
    castTargetVersion: `ct:${id}`,
    sourceSignature: `sig:${id}`,
    pourFaceDecision: { selected: "+Z", castingOrientation: "+Z", score: 1, candidates: [], fillabilityWarnings: [], ventPlan: { status: "clear", features: [], unresolvedRecommendations: [] } },
    accessibility: { directions: [], onePieceReleaseFeasible: true },
    releaseMode: pieces > 1 ? "multi-piece" : "one-piece",
    partingSurfaces: [],
    assembly: {
      pieces: Array.from({ length: pieces }, (_, index) => piece(index)),
      registrationFeatures: [],
      coreMode: "split",
      releaseSequence: [],
    },
    warnings: [],
    fingerprint: `set:${id}`,
  };
}

function entry(id: string, status: MasterToolingSetState["status"], pieces = 1, set: MasterToolingSet | null = setFor(id, pieces)): MasterToolingSetState {
  return {
    moldPartId: id,
    moldPartName: `Mold ${id}`,
    status,
    sourceSignature: `sig:${id}`,
    contentVersion: `ct:${id}`,
    set: status === "blocked" ? null : set,
    failureMessage: status === "blocked" ? "no reusable tooling plan." : null,
  };
}

describe("selectRenderableMasterMoldBodies (Execution 05 Article 14)", () => {
  it("renders every piece of current and stale sets, never a blocked one", () => {
    const rendered = selectRenderableMasterMoldBodies([
      entry("a", "current", 2),
      entry("b", "blocked"),
      entry("c", "stale", 1),
    ]);

    expect(rendered).toHaveLength(3);
    expect(rendered.map((body) => body.id)).toEqual(["piece-0", "piece-1", "piece-0"]);
    expect(rendered.every((body) => body.watertight === true)).toBe(true);
  });

  it("tags pieces of stale sets as stale and current sets as not stale (Article 02: stale must render as a ghosted holdover, never disappear)", () => {
    const rendered = selectRenderableMasterMoldBodies([entry("a", "current"), entry("b", "stale")]);
    expect(rendered.find((body) => body.name === "Tooling Piece 0" && body.geometryIdentity.includes("set:a"))?.stale).toBe(false);
    expect(rendered.find((body) => body.geometryIdentity.includes("set:b"))?.stale).toBe(true);
  });

  it("returns an empty list when every set is blocked", () => {
    expect(selectRenderableMasterMoldBodies([entry("a", "blocked")])).toEqual([]);
  });

  it("maps piece provenance to the MoldBodyData shape the viewport renderer expects", () => {
    const [rendered] = selectRenderableMasterMoldBodies([entry("a", "current", 1)]);
    expect(rendered).toMatchObject({
      id: "piece-0",
      name: "Tooling Piece 0",
      visible: true,
      triangleCount: 1,
      volumeMm3: 10,
      watertight: true,
    });
  });

  it("keys each piece's geometry identity on the owning set's fingerprint (stable across renders, unique across regenerations)", () => {
    const [first] = selectRenderableMasterMoldBodies([entry("a", "current", 2)]);
    expect(first!.geometryIdentity).toBe("set:a:piece-0");
  });
});
