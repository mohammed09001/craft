import { describe,expect,it } from "vitest";

import type {
  WatertightPartSolid,
} from "./cavityGeneration.contracts";
import {
  createCavitySignedDistanceField,
} from "./cavitySignedDistance.bvh";

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

describe("BVH cavity signed-distance field",()=>{
  it("returns positive distance inside a closed solid",()=>{
    const field=createCavitySignedDistanceField(
      cubePreparedSolid(),
    );

    try{
      expect(
        field.signedDistance([5,5,5]),
      ).toBeCloseTo(5,5);
    }finally{
      field.dispose();
    }
  });

  it("returns negative distance outside a closed solid",()=>{
    const field=createCavitySignedDistanceField(
      cubePreparedSolid(),
    );

    try{
      expect(
        field.signedDistance([15,5,5]),
      ).toBeCloseTo(-5,5);
    }finally{
      field.dispose();
    }
  });

  it("returns zero on the source surface",()=>{
    const field=createCavitySignedDistanceField(
      cubePreparedSolid(),
    );

    try{
      expect(
        field.signedDistance([0,5,5]),
      ).toBe(0);
    }finally{
      field.dispose();
    }
  });

  it("is deterministic for repeated queries",()=>{
    const field=createCavitySignedDistanceField(
      cubePreparedSolid(),
    );

    try{
      const first=
        field.signedDistance([2,3,4]);

      const second=
        field.signedDistance([2,3,4]);

      expect(second).toBe(first);
      expect(first).toBeGreaterThan(0);
    }finally{
      field.dispose();
    }
  });

  it("rejects non-manifold source geometry",()=>{
    const prepared={
      ...cubePreparedSolid(),
      manifold:false,
    };

    expect(
      ()=>createCavitySignedDistanceField(
        prepared,
      ),
    ).toThrow(
      "Signed-distance generation requires a watertight manifold.",
    );
  });

  it("rejects invalid query points",()=>{
    const field=createCavitySignedDistanceField(
      cubePreparedSolid(),
    );

    try{
      expect(
        ()=>field.signedDistance([
          Number.NaN,
          0,
          0,
        ]),
      ).toThrow(
        "Signed-distance query point is invalid.",
      );
    }finally{
      field.dispose();
    }
  });

  it("allows repeated disposal safely",()=>{
    const field=createCavitySignedDistanceField(
      cubePreparedSolid(),
    );

    field.dispose();

    expect(
      ()=>field.dispose(),
    ).not.toThrow();
  });
});


