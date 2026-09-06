import { describe,expect,it } from "vitest";

import type {
  WatertightPartSolid,
} from "./cavityGeneration.contracts";
import {
  buildDistanceFieldQualityProfile,
} from "./cavityDistanceField.profile";

function preparedSolid(
  size:
    readonly [number,number,number]=
      [10,20,30],
):WatertightPartSolid {
  return {
    mesh:{
      positions:[
        0,0,0,
        size[0],0,0,
        0,size[1],0,
        0,0,size[2],
      ],
      indices:[
        0,2,1,
        0,1,3,
        0,3,2,
        1,2,3,
      ],
    },
    bounds:{
      min:{x:0,y:0,z:0},
      max:{
        x:size[0],
        y:size[1],
        z:size[2],
      },
    },
    volumeMm3:
      size[0]*size[1]*size[2]/6,
    triangleCount:4,
    connectedComponentCount:1,
    watertight:true,
    manifold:true,
    warnings:[],
  };
}

describe("distance-field quality profile",()=>{
  it("creates a higher-resolution profile for high quality",()=>{
    const standard=
      buildDistanceFieldQualityProfile(
        preparedSolid(),
        0.2,
        "standard",
        1e-6,
      );

    const high=
      buildDistanceFieldQualityProfile(
        preparedSolid(),
        0.2,
        "high",
        1e-6,
      );

    expect(
      high.effectiveEdgeLengthMm,
    ).toBeLessThan(
      standard.effectiveEdgeLengthMm,
    );

    expect(
      high.maximumAxisCells,
    ).toBeGreaterThan(
      standard.maximumAxisCells,
    );

    expect(
      high.estimatedGridCellCount,
    ).toBeGreaterThan(
      standard.estimatedGridCellCount,
    );
  });

  it("expands bounds beyond the requested clearance",()=>{
    const profile=
      buildDistanceFieldQualityProfile(
        preparedSolid(),
        0.2,
        "high",
        1e-6,
      );

    expect(profile.bounds.min[0])
      .toBeLessThan(-0.2);

    expect(profile.bounds.min[1])
      .toBeLessThan(-0.2);

    expect(profile.bounds.min[2])
      .toBeLessThan(-0.2);

    expect(profile.bounds.max[0])
      .toBeGreaterThan(10.2);

    expect(profile.bounds.max[1])
      .toBeGreaterThan(20.2);

    expect(profile.bounds.max[2])
      .toBeGreaterThan(30.2);
  });

  it("limits resolution using the longest model axis",()=>{
    const profile=
      buildDistanceFieldQualityProfile(
        preparedSolid([1_000,10,10]),
        0.2,
        "high",
        1e-6,
      );

    expect(
      profile.effectiveEdgeLengthMm,
    ).toBeGreaterThanOrEqual(
      1_000/384,
    );

    expect(
      profile.estimatedGridDimensions[0],
    ).toBeLessThanOrEqual(389);
  });

  it("uses deterministic grid dimensions",()=>{
    const first=
      buildDistanceFieldQualityProfile(
        preparedSolid(),
        0.2,
        "high",
        1e-6,
      );

    const second=
      buildDistanceFieldQualityProfile(
        preparedSolid(),
        0.2,
        "high",
        1e-6,
      );

    expect(
      second.estimatedGridDimensions,
    ).toEqual(
      first.estimatedGridDimensions,
    );

    expect(
      second.estimatedGridCellCount,
    ).toBe(
      first.estimatedGridCellCount,
    );
  });

  it("rejects zero clearance because exact geometry handles it",()=>{
    expect(
      ()=>buildDistanceFieldQualityProfile(
        preparedSolid(),
        0,
        "high",
        1e-6,
      ),
    ).toThrow(
      "Distance-field clearance must be positive.",
    );
  });

  it("rejects invalid source bounds",()=>{
    const invalid={
      ...preparedSolid(),
      bounds:{
        min:{x:0,y:0,z:0},
        max:{x:0,y:20,z:30},
      },
    };

    expect(
      ()=>buildDistanceFieldQualityProfile(
        invalid,
        0.2,
        "high",
        1e-6,
      ),
    ).toThrow(
      "Distance-field source bounds are invalid.",
    );
  });

  it("marks oversized cubic grids as outside the safe budget",()=>{
    const profile=
      buildDistanceFieldQualityProfile(
        preparedSolid([1_000,1_000,1_000]),
        0.2,
        "high",
        1e-6,
      );

    expect(
      profile.estimatedGridCellCount,
    ).toBeGreaterThan(
      profile.maximumGridCellCount,
    );

    expect(
      profile.exceedsGridBudget,
    ).toBe(true);
  });

  it("keeps ordinary model grids within the safe budget",()=>{
    const profile=
      buildDistanceFieldQualityProfile(
        preparedSolid([10,20,30]),
        0.2,
        "high",
        1e-6,
      );

    expect(
      profile.estimatedGridCellCount,
    ).toBeLessThanOrEqual(
      profile.maximumGridCellCount,
    );

    expect(
      profile.exceedsGridBudget,
    ).toBe(false);
  });});

