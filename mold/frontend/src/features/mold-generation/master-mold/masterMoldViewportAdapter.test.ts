import { describe, expect, it } from "vitest";

import { selectRenderableMasterMoldBodies } from "./masterMoldViewportAdapter";
import type { MasterMoldBodyResult } from "./masterMold.contracts";

function currentBody(id: string): MasterMoldBodyResult {
  return {
    source: { finalMoldPartId: id, finalMoldPartName: `Final Mold ${id}`, finalMoldGeometryVersion: `geom:${id}` },
    status: "current",
    direction: "+Z",
    directionAnalysis: { candidates: [], selected: "+Z", feasible: true },
    mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    volumeMm3: 10,
    triangleCount: 1,
    watertight: true,
    manifold: true,
    failureReason: null,
    failureMessage: null,
    fingerprint: { finalMoldGeometryVersion: `geom:${id}`, parametersSignature: "p", directionOverride: null, value: `v:${id}` },
  };
}

function staleBody(id: string): MasterMoldBodyResult {
  const current = currentBody(id);
  return { ...current, status: "stale" };
}

function blockedBody(id: string): MasterMoldBodyResult {
  return {
    source: { finalMoldPartId: id, finalMoldPartName: `Final Mold ${id}`, finalMoldGeometryVersion: `geom:${id}` },
    status: "blocked",
    direction: null,
    directionAnalysis: { candidates: [], selected: null, feasible: false },
    mesh: null,
    bounds: null,
    volumeMm3: null,
    triangleCount: null,
    watertight: false,
    manifold: false,
    failureReason: "no_valid_open_direction",
    failureMessage: "No feasible direction.",
    fingerprint: { finalMoldGeometryVersion: `geom:${id}`, parametersSignature: "p", directionOverride: null, value: `v:${id}` },
  };
}

describe("selectRenderableMasterMoldBodies", () => {
  it("renders current and stale bodies, never a blocked one", () => {
    const bodies = [currentBody("a"), blockedBody("b"), staleBody("c")];

    const rendered = selectRenderableMasterMoldBodies(bodies);

    expect(rendered.map((body) => body.id)).toEqual(["a", "c"]);
    expect(rendered.every((body) => body.watertight === true && body.mesh !== null)).toBe(true);
  });

  it("tags stale bodies as stale and current bodies as not stale (Article 02: stale must render as a ghosted holdover, never disappear)", () => {
    const rendered = selectRenderableMasterMoldBodies([currentBody("a"), staleBody("b")]);
    expect(rendered.find((body) => body.id === "a")?.stale).toBe(false);
    expect(rendered.find((body) => body.id === "b")?.stale).toBe(true);
  });

  it("returns an empty list when every body is blocked", () => {
    expect(selectRenderableMasterMoldBodies([blockedBody("a")])).toEqual([]);
  });

  it("maps provenance fields to the MoldBodyData shape the viewport renderer expects", () => {
    const [rendered] = selectRenderableMasterMoldBodies([currentBody("a")]);
    expect(rendered).toMatchObject({
      id: "a",
      name: "Final Mold a",
      visible: true,
      triangleCount: 1,
      volumeMm3: 10,
      watertight: true,
    });
  });
});
