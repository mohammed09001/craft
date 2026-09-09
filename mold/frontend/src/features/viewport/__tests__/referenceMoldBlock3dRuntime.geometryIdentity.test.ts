import {
  Group,
  Object3D,
} from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createReferenceMoldBlock3dRuntime,
} from "../runtime/referenceMoldBlock3dRuntime";
import type { ReferenceMoldDefinition } from "../../mold-generation/reference-mold-definition/referenceMoldDefinition.contracts";
import type { MoldBodyData } from "../../mold-generation/reference-mold-definition/orthogonalMold";

const baseBody: MoldBodyData = {
  id: "body-1",
  name: "M1",
  visible: true,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
  centroid: { x: 5, y: 5, z: 5 },
  triangleCount: 12,
  volumeMm3: 1000,
  watertight: true,
  mesh: {
    positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 10, 10, 0, 10],
    indices: [0, 1, 2, 3, 4, 5],
  },
};

function definitionWith(bodies: MoldBodyData[] | null): ReferenceMoldDefinition {
  return {
    schemaVersion: 1,
    definitionId: "definition-1",
    modelId: "model-1",
    coordinateSystem: { units: "millimeters", upAxis: "Z" },
    selectionBoxBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
    referenceMoldBlock: {
      clearanceMm: 10,
      bounds: { min: { x: -10, y: -10, z: -10 }, max: { x: 20, y: 20, z: 20 } },
    },
    usedFaces: [],
    moldBodies: bodies ?? undefined,
  };
}

const versioned = (version: string) => ({ ...baseBody, geometryVersion: version });

/** The rebuild's expensive side effect is observable through `invalidate`:
 * every full rebuild calls it, a metadata-only skip does not. */
function setup() {
  const invalidate = vi.fn();
  const runtime = createReferenceMoldBlock3dRuntime(invalidate);
  const target = new Group();
  runtime.setTarget("model-1", target);
  const rebuildCount = () => invalidate.mock.calls.length;
  return { runtime, rebuildCount, target: target as Object3D };
}

describe("reference mold geometry identity is fail-safe", () => {
  it("skips the full rebuild for a fresh wrapper whose trustworthy body versions are unchanged", () => {
    const { runtime, rebuildCount } = setup();

    runtime.setDefinition(definitionWith([versioned("v1")]));
    const afterFirst = rebuildCount();

    // Viewport-style fresh wrapper: same geometry identity, different object.
    runtime.setDefinition({ ...definitionWith([versioned("v1")]), usedFaces: ["left"] });
    expect(rebuildCount()).toBe(afterFirst);

    runtime.dispose();
  });

  it("rebuilds when the trustworthy geometryVersion changes even if all metadata matches", () => {
    const { runtime, rebuildCount } = setup();

    runtime.setDefinition(definitionWith([versioned("v1")]));
    const afterFirst = rebuildCount();

    runtime.setDefinition(definitionWith([versioned("v2")]));
    expect(rebuildCount()).toBe(afterFirst + 1);

    runtime.dispose();
  });

  it("rebuilds when a body lacks a trustworthy version, even with identical id/triangleCount/bounds", () => {
    const unversioned: MoldBodyData = { ...baseBody };
    const tamperedPayload: MoldBodyData = {
      ...baseBody,
      mesh: { positions: [...baseBody.mesh.positions, 5, 5, 5], indices: [...baseBody.mesh.indices, 0, 1, 2] },
    };

    const { runtime, rebuildCount } = setup();

    runtime.setDefinition(definitionWith([unversioned]));
    const afterFirst = rebuildCount();

    // Same id, same triangleCount, same bounds, unknown identity, DIFFERENT
    // mesh payload: the skip is forbidden and the rebuild happens.
    runtime.setDefinition(definitionWith([tamperedPayload]));
    expect(rebuildCount()).toBe(afterFirst + 1);

    // Two consecutive untrustworthy sets are never treated as equal either.
    runtime.setDefinition(definitionWith([unversioned]));
    expect(rebuildCount()).toBe(afterFirst + 2);

    runtime.dispose();
  });

  it("rebuilds when only some bodies lack versions (partial trust is no trust)", () => {
    const { runtime, rebuildCount } = setup();

    runtime.setDefinition(definitionWith([versioned("v1")]));
    const afterFirst = rebuildCount();

    runtime.setDefinition(definitionWith([versioned("v1"), { ...baseBody, id: "body-2" }]));
    expect(rebuildCount()).toBe(afterFirst + 1);

    runtime.dispose();
  });
});
