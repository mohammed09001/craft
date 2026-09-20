import { describe, expect, it } from "vitest";

import { getManifoldModule, payloadFromManifold, createBlankSolid, manifoldFromPayload } from "../../geometry/manifold";
import { meshTopology } from "../../geometry/meshTopology";
import type { PlanningVector3 } from "./masterMoldPlanning.contracts";
import { basisAround, ruledPartingSurfaceSolid, heightFieldPartingSolid, multiNeighborHeightFieldSolid, halfSpacePrismPayload } from "./workingMoldConstructor";

/**
 * Execution 08 LOOP 14: the first increment of "Working Mold must not
 * require every parting interface to be one infinite plane" -- a "ruled
 * surface" cutting tool built by sweeping the piece's own real parting
 * curve (Loop 13's ordered curve) along a direction, instead of an infinite
 * half-space plane. These tests exercise the geometric primitive in
 * isolation, against known shapes with an analytically predictable volume,
 * before it is wired into the full search/construction pipeline.
 */
describe("ruledPartingSurfaceSolid (Execution 08 LOOP 14)", () => {
  it("sweeps a square loop along a world axis into a box of the exact expected volume", async () => {
    const module = await getManifoldModule();
    const square: PlanningVector3[] = [
      { x: -5, y: -5, z: 0 },
      { x: 5, y: -5, z: 0 },
      { x: 5, y: 5, z: 0 },
      { x: -5, y: 5, z: 0 },
    ];
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    const solid = ruledPartingSurfaceSolid(module, square, { x: 0, y: 0, z: 1 }, bounds);
    try {
      expect(solid.status()).toBe("NoError");
      // Cross-section area 10x10 = 100mm^2; height = diagonal*1.5+2.
      const diagonal = Math.hypot(20, 20, 20);
      const expectedHeight = diagonal * 1.5 + 2;
      expect(solid.volume()).toBeCloseTo(100 * expectedHeight, 0);

      const mesh = payloadFromManifold(solid);
      const topology = meshTopology(mesh);
      expect(topology.openEdgeCount).toBe(0);
      expect(topology.nonManifoldEdgeCount).toBe(0);
      const components = solid.decompose();
      expect(components.length).toBe(1);
      for (const component of components) component.delete();
    } finally {
      solid.delete();
    }
  });

  it("sweeps a square defined IN the oblique sweep plane into a solid of the exact expected volume", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    const obliqueLength = Math.hypot(1, 1, 1);
    const oblique = { x: 1 / obliqueLength, y: 1 / obliqueLength, z: 1 / obliqueLength };
    // The function projects world-space curve points onto the plane
    // perpendicular to `direction` -- a curve that does NOT already lie in
    // that plane legitimately projects to a smaller footprint (this is the
    // correct silhouette-from-the-release-direction behavior a real parting
    // curve relies on). Building the square directly in the (u, v) plane
    // for THIS direction, via the same `basisAround` the implementation
    // uses, keeps this a fair like-for-like volume check.
    const { u, v } = basisAround(oblique);
    const point = (pu: number, pv: number): PlanningVector3 => ({
      x: u.x * pu + v.x * pv,
      y: u.y * pu + v.y * pv,
      z: u.z * pu + v.z * pv,
    });
    const square: PlanningVector3[] = [point(-5, -5), point(5, -5), point(5, 5), point(-5, 5)];
    const solid = ruledPartingSurfaceSolid(module, square, oblique, bounds);
    try {
      expect(solid.status()).toBe("NoError");
      const diagonal = Math.hypot(20, 20, 20);
      const expectedHeight = diagonal * 1.5 + 2;
      expect(solid.volume()).toBeCloseTo(100 * expectedHeight, 0);
    } finally {
      solid.delete();
    }
  });

  it("intersecting the swept solid with a big block extracts exactly the polygon footprint times the block's own span along the axis", async () => {
    const module = await getManifoldModule();
    // A hexagonal loop (not axis-aligned rectangle) -- exercises a genuinely
    // non-planar-search-derived shape, closer to a real parting curve.
    const radius = 4;
    const hexagon: PlanningVector3[] = Array.from({ length: 6 }, (_, index) => {
      const angle = (index / 6) * Math.PI * 2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 };
    });
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    const solid = ruledPartingSurfaceSolid(module, hexagon, { x: 0, y: 0, z: 1 }, bounds);
    const block = module.Manifold.cube([20, 20, 6], true);
    try {
      const clipped = solid.intersect(block);
      try {
        expect(clipped.status()).toBe("NoError");
        // Regular hexagon area = (3*sqrt(3)/2) * radius^2; block spans 6mm along Z.
        const hexagonArea = (3 * Math.sqrt(3) / 2) * radius * radius;
        expect(clipped.volume()).toBeCloseTo(hexagonArea * 6, 0);
      } finally {
        clipped.delete();
      }
    } finally {
      block.delete();
      solid.delete();
    }
  });

  it("rejects a degenerate curve with fewer than 3 points", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    expect(() =>
      ruledPartingSurfaceSolid(module, [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], { x: 0, y: 0, z: 1 }, bounds),
    ).toThrow(/at least 3 curve points/);
  });
});

/**
 * Execution 08 LOOP 14, second increment: `ruledPartingSurfaceSolid` alone
 * is bounded to the curve's own local (u, v) footprint, which is NOT a
 * valid drop-in replacement for an infinite half-space plane (a naive
 * substitution excluded the mold envelope's own far-field wall material,
 * and a follow-up boolean composition attempt produced volume-correct but
 * topologically fragmented pieces -- see `heightFieldPartingSolid`'s own
 * doc comment). `heightFieldPartingSolid` is the real fix: a single,
 * explicitly-built watertight mesh whose lower boundary follows the
 * curve's own real per-point height near the part and is EXACTLY the flat
 * plane's own offset at and beyond a generous outer radius -- a genuine
 * height field, not a bounded polygon extrusion.
 */
describe("heightFieldPartingSolid (Execution 08 LOOP 14)", () => {
  it("a perfectly flat curve produces a solid matching the analytic n-gon-prism volume exactly", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    const n = 8;
    const curveRadius = 3;
    const curve: PlanningVector3[] = Array.from({ length: n }, (_, index) => {
      const angle = (index / n) * Math.PI * 2;
      return { x: Math.cos(angle) * curveRadius, y: Math.sin(angle) * curveRadius, z: 0 };
    });
    const solid = heightFieldPartingSolid(module, curve, { x: 0, y: 0, z: 1 }, 0, bounds, 1e-4);
    try {
      expect(solid.status()).toBe("NoError");
      const diagonal = Math.hypot(20, 20, 20);
      const outerRadius = diagonal + curveRadius + 1;
      const depth = diagonal * 1.5 + 2;
      const polygonArea = 0.5 * n * outerRadius * outerRadius * Math.sin((2 * Math.PI) / n);
      expect(solid.volume()).toBeCloseTo(polygonArea * depth, -1);

      const mesh = payloadFromManifold(solid);
      const topology = meshTopology(mesh);
      expect(topology.openEdgeCount).toBe(0);
      expect(topology.nonManifoldEdgeCount).toBe(0);
      const components = solid.decompose();
      expect(components.length).toBe(1);
      for (const component of components) component.delete();
    } finally {
      solid.delete();
    }
  });

  it("far from the curve's local footprint, the solid matches the flat plane offset exactly", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    const n = 6;
    const curveRadius = 2;
    // A curve with real height variation (not flat) -- the local correction this test isn't checking.
    const curve: PlanningVector3[] = Array.from({ length: n }, (_, index) => {
      const angle = (index / n) * Math.PI * 2;
      return { x: Math.cos(angle) * curveRadius, y: Math.sin(angle) * curveRadius, z: Math.sin(angle * 2) * 1.5 };
    });
    const flatOffsetMm = 0;
    const solid = heightFieldPartingSolid(module, curve, { x: 0, y: 0, z: 1 }, flatOffsetMm, bounds, 1e-4);
    // Tall enough to fully cover the probe below (z spans [-10, 10]).
    const flatHalfSpace = createBlankSolid(module, { min: { x: -9, y: -9, z: flatOffsetMm }, max: { x: 9, y: 9, z: 20 } });
    // Sample far from the curve's own small footprint (radius 2): a probe
    // block near the envelope's own corner, well outside the local
    // correction region, should be carved IDENTICALLY by the height-field
    // tool and the flat plane.
    const probe = module.Manifold.cube([2, 2, 20], true).translate(8, 8, 0);
    try {
      const heightFieldProbe = probe.intersect(solid);
      const flatProbe = probe.intersect(flatHalfSpace);
      expect(heightFieldProbe.volume()).toBeCloseTo(flatProbe.volume(), 1);
      heightFieldProbe.delete();
      flatProbe.delete();
    } finally {
      probe.delete();
      flatHalfSpace.delete();
      solid.delete();
    }
  });

  it("rejects a degenerate curve with fewer than 3 points", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    expect(() =>
      heightFieldPartingSolid(module, [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], { x: 0, y: 0, z: 1 }, 0, bounds, 1e-4),
    ).toThrow(/at least 3 curve points/);
  });
});

/**
 * Execution 08 LOOP 14, multi-neighbor increment: a piece bordering several
 * other pieces has a boundary that is not one simple loop overall --
 * `multiNeighborHeightFieldSolid` composes one independent local correction
 * per neighbor's own curve onto a shared flat base, instead of one general
 * multi-loop triangulation.
 */
describe("multiNeighborHeightFieldSolid (Execution 08 LOOP 14)", () => {
  const octagon = (cx: number, cy: number, radius: number, z: number): PlanningVector3[] =>
    Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, z };
    });

  it("composes two separate flat curves into one watertight, single-connected, volume-conserving solid", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -20, y: -20, z: -20 }, max: { x: 20, y: 20, z: 20 } };
    const curveA = octagon(-10, 0, 2, 0);
    const curveB = octagon(10, 0, 2, 0);
    const tool = multiNeighborHeightFieldSolid(module, [curveA, curveB], { x: 0, y: 0, z: 1 }, 0, bounds, 1e-4);
    try {
      expect(tool.status()).toBe("NoError");
      const mesh = payloadFromManifold(tool);
      const topology = meshTopology(mesh);
      expect(topology.openEdgeCount).toBe(0);
      expect(topology.nonManifoldEdgeCount).toBe(0);
      const components = tool.decompose();
      expect(components.length).toBe(1);
      for (const component of components) component.delete();

      // Volume conservation: the whole envelope, split by this tool, must
      // sum back to exactly the envelope's own volume -- no gap, no overlap.
      const remainder = createBlankSolid(module, bounds);
      const region = remainder.intersect(tool);
      const rest = remainder.subtract(tool);
      expect(region.decompose().length).toBe(1);
      expect(rest.decompose().length).toBe(1);
      const envelopeVolume = (bounds.max.x - bounds.min.x) * (bounds.max.y - bounds.min.y) * (bounds.max.z - bounds.min.z);
      expect(region.volume() + rest.volume()).toBeCloseTo(envelopeVolume, 3);
      region.delete();
      rest.delete();
    } finally {
      tool.delete();
    }
  });

  it("composes two curves with real, opposite height variation into one connected solid", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -20, y: -20, z: -20 }, max: { x: 20, y: 20, z: 20 } };
    const wavy = (cx: number, cy: number, radius: number, amplitude: number): PlanningVector3[] =>
      Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, z: amplitude };
      });
    const curveA = wavy(-10, 0, 2, 3);
    const curveB = wavy(10, 0, 2, -3);
    const tool = multiNeighborHeightFieldSolid(module, [curveA, curveB], { x: 0, y: 0, z: 1 }, 0, bounds, 1e-4);
    try {
      expect(tool.status()).toBe("NoError");
      const components = tool.decompose();
      expect(components.length).toBe(1);
      for (const component of components) component.delete();
    } finally {
      tool.delete();
    }
  });

  it("far from every curve's local footprint, matches the flat plane exactly", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -20, y: -20, z: -20 }, max: { x: 20, y: 20, z: 20 } };
    const curveA = octagon(-10, 0, 1, 4);
    const curveB = octagon(10, 0, 1, -4);
    const tool = multiNeighborHeightFieldSolid(module, [curveA, curveB], { x: 0, y: 0, z: 1 }, 0, bounds, 1e-4);
    const flatTool = manifoldFromPayload(module, halfSpacePrismPayload({ x: 0, y: 0, z: 1 }, 0, bounds), 1e-4);
    // A probe far from both curves (they sit near x=-10 and x=10; this
    // probe is near the envelope's own corner at y=18).
    const probe = module.Manifold.cube([2, 2, 30], true).translate(0, 18, 0);
    try {
      const toolProbe = probe.intersect(tool);
      const flatProbe = probe.intersect(flatTool);
      expect(toolProbe.volume()).toBeCloseTo(flatProbe.volume(), 1);
      toolProbe.delete();
      flatProbe.delete();
    } finally {
      probe.delete();
      flatTool.delete();
      tool.delete();
    }
  });

  it("rejects an empty curve group list", async () => {
    const module = await getManifoldModule();
    const bounds = { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
    expect(() => multiNeighborHeightFieldSolid(module, [], { x: 0, y: 0, z: 1 }, 0, bounds, 1e-4)).toThrow(/at least one curve/);
  });
});
