import { describe,expect,it } from "vitest";

import type {
  WatertightPartSolid,
} from "./cavityGeneration.contracts";
import {
  createDistanceFieldCavityTool,
} from "./cavityDistanceField.engine";

function cubePreparedSolid():WatertightPartSolid {
  return {
    mesh:{
      positions:[
        0,0,0,
        10,0,0,
        10,10,0,
        0,10,0,
        0,0,10,
        10,0,10,
        10,10,10,
        0,10,10,
      ],
      indices:[
        0,2,1,
        0,3,2,

        4,5,6,
        4,6,7,

        0,1,5,
        0,5,4,

        1,2,6,
        1,6,5,

        2,3,7,
        2,7,6,

        3,0,4,
        3,4,7,
      ],
    },
    bounds:{
      min:{x:0,y:0,z:0},
      max:{x:10,y:10,z:10},
    },
    volumeMm3:1_000,
    triangleCount:12,
    connectedComponentCount:1,
    watertight:true,
    manifold:true,
    warnings:[],
  };
}

describe("distance-field cavity engine",()=>{
  it("creates a positive outward offset without Minkowski",async()=>{
    const result=
      await createDistanceFieldCavityTool(
        cubePreparedSolid(),
        0.2,
        "high",
        1e-6,
      );

    expect(
      result.tool.implementationMethod,
    ).toBe(
      "manifold-level-set-sdf",
    );

    expect(result.tool.clearanceMm)
      .toBe(0.2);

    expect(result.tool.qualityMode)
      .toBe("high");

    expect(result.tool.watertight)
      .toBe(true);

    expect(result.tool.manifold)
      .toBe(true);

    expect(result.tool.volumeMm3)
      .toBeGreaterThan(1_000);

    expect(result.tool.triangleCount)
      .toBeGreaterThan(0);

    expect(result.tool.connectedComponentCount)
      .toBe(1);
  });

  it("expands cube bounds approximately by the requested clearance",async()=>{
    const result=
      await createDistanceFieldCavityTool(
        cubePreparedSolid(),
        0.2,
        "high",
        1e-6,
      );

    const errorAllowance=
      result.profile.effectiveEdgeLengthMm*2;

    expect(result.tool.bounds.min.x)
      .toBeLessThan(0);

    expect(result.tool.bounds.min.y)
      .toBeLessThan(0);

    expect(result.tool.bounds.min.z)
      .toBeLessThan(0);

    expect(result.tool.bounds.max.x)
      .toBeGreaterThan(10);

    expect(result.tool.bounds.max.y)
      .toBeGreaterThan(10);

    expect(result.tool.bounds.max.z)
      .toBeGreaterThan(10);

    expect(
      Math.abs(
        result.tool.bounds.min.x+0.2,
      ),
    ).toBeLessThanOrEqual(
      errorAllowance,
    );

    expect(
      Math.abs(
        result.tool.bounds.max.x-10.2,
      ),
    ).toBeLessThanOrEqual(
      errorAllowance,
    );
  });

  it("produces deterministic profile settings",async()=>{
    const first=
      await createDistanceFieldCavityTool(
        cubePreparedSolid(),
        0.2,
        "standard",
        1e-6,
      );

    const second=
      await createDistanceFieldCavityTool(
        cubePreparedSolid(),
        0.2,
        "standard",
        1e-6,
      );

    expect(
      second.profile,
    ).toEqual(
      first.profile,
    );

    expect(
      second.tool.implementationMethod,
    ).toBe(
      first.tool.implementationMethod,
    );
  });

  it("rejects zero clearance because exact geometry handles it",async()=>{
    await expect(
      createDistanceFieldCavityTool(
        cubePreparedSolid(),
        0,
        "high",
        1e-6,
      ),
    ).rejects.toThrow(
      "Distance-field cavity clearance must be positive.",
    );
  });

  it("rejects grids that exceed the safe memory budget",async()=>{
    const oversized={
      ...cubePreparedSolid(),
      bounds:{
        min:{x:0,y:0,z:0},
        max:{x:1_000,y:1_000,z:1_000},
      },
    };

    await expect(
      createDistanceFieldCavityTool(
        oversized,
        0.2,
        "high",
        1e-6,
      ),
    ).rejects.toThrow(
      "Distance-field grid exceeds the safe budget:",
    );
  });});

