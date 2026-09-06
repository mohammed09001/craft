import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  CavityToolData,
  WatertightPartSolid,
} from "./cavityGeneration.contracts";

const {
  createCavityToolMock,
  createDistanceFieldCavityToolMock,
}=vi.hoisted(()=>({
  createCavityToolMock:vi.fn(),
  createDistanceFieldCavityToolMock:vi.fn(),
}));

vi.mock("./manifold.engine",()=>({
  createCavityTool:createCavityToolMock,
}));

vi.mock("./cavityDistanceField.engine",()=>({
  createDistanceFieldCavityTool:
    createDistanceFieldCavityToolMock,
}));

import {
  createAutomaticCavityTool,
} from "./cavityOffset.orchestrator";

function preparedSolid(
  triangleCount=12,
  connectedComponentCount=1,
):WatertightPartSolid {
  return {
    mesh:{
      positions:[
        0,0,0,
        10,0,0,
        0,10,0,
        0,0,10,
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
      max:{x:10,y:10,z:10},
    },
    volumeMm3:1_000,
    triangleCount,
    connectedComponentCount,
    watertight:true,
    manifold:true,
    warnings:[],
  };
}

function cavityTool(
  implementationMethod:
    CavityToolData["implementationMethod"],
  clearanceMm:number,
):CavityToolData {
  return {
    ...preparedSolid(),
    clearanceMm,
    implementationMethod,
    qualityMode:"high",
  };
}

describe("automatic cavity offset orchestrator",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
  });

  it("uses exact geometry for zero clearance",async()=>{
    createCavityToolMock.mockResolvedValue(
      cavityTool("exact-watertight-part-solid",0),
    );

    const result=await createAutomaticCavityTool(
      preparedSolid(),
      0,
      "high",
      1e-6,
    );

    expect(result.decision.engine)
      .toBe("exact-zero-clearance");

    expect(result.tool.implementationMethod)
      .toBe("exact-watertight-part-solid");

    expect(result.usedFallback).toBe(false);
    expect(result.attempts).toEqual([
      {
        engine:"exact-zero-clearance",
        status:"succeeded",
        errorMessage:null,
      },
    ]);

    expect(
      createDistanceFieldCavityToolMock,
    ).not.toHaveBeenCalled();
  });

  it("uses Minkowski for a simple positive-clearance model",async()=>{
    createCavityToolMock.mockResolvedValue(
      cavityTool(
        "manifold-minkowski-sphere",
        0.2,
      ),
    );

    const result=await createAutomaticCavityTool(
      preparedSolid(),
      0.2,
      "high",
      1e-6,
    );

    expect(result.decision.engine)
      .toBe("direct-minkowski");

    expect(result.tool.implementationMethod)
      .toBe("manifold-minkowski-sphere");

    expect(result.usedFallback).toBe(false);
  });

  it("uses distance field directly for a heavy model",async()=>{
    createDistanceFieldCavityToolMock
      .mockResolvedValue({
        tool:cavityTool(
          "manifold-level-set-sdf",
          0.2,
        ),
        profile:{},
      });

    const result=await createAutomaticCavityTool(
      preparedSolid(100_000),
      0.2,
      "high",
      1e-6,
    );

    expect(result.decision.engine)
      .toBe("distance-field");

    expect(result.tool.implementationMethod)
      .toBe("manifold-level-set-sdf");

    expect(result.usedFallback).toBe(false);

    expect(
      createCavityToolMock,
    ).not.toHaveBeenCalled();
  });

  it("falls back to distance field when direct Minkowski fails",async()=>{
    createCavityToolMock.mockRejectedValue(
      new Error("Minkowski failed."),
    );

    createDistanceFieldCavityToolMock
      .mockResolvedValue({
        tool:cavityTool(
          "manifold-level-set-sdf",
          0.2,
        ),
        profile:{},
      });

    const result=await createAutomaticCavityTool(
      preparedSolid(),
      0.2,
      "high",
      1e-6,
    );

    expect(result.decision.engine)
      .toBe("direct-minkowski");

    expect(result.usedFallback).toBe(true);

    expect(result.tool.implementationMethod)
      .toBe("manifold-level-set-sdf");

    expect(result.attempts).toEqual([
      {
        engine:"direct-minkowski",
        status:"failed",
        errorMessage:"Minkowski failed.",
      },
      {
        engine:"distance-field",
        status:"succeeded",
        errorMessage:null,
      },
    ]);
  });

  it("rejects invalid geometry tolerance before selecting an engine",async()=>{
    await expect(
      createAutomaticCavityTool(
        preparedSolid(),
        0.2,
        "high",
        0,
      ),
    ).rejects.toThrow(
      "Automatic cavity geometry tolerance must be positive.",
    );

    expect(
      createCavityToolMock,
    ).not.toHaveBeenCalled();

    expect(
      createDistanceFieldCavityToolMock,
    ).not.toHaveBeenCalled();
  });
});
