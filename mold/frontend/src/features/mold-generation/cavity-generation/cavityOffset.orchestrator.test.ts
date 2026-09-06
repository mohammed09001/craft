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
import type { CavityOffsetEngineDeps } from "./cavityOffset.orchestrator";

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

// `createCavityTool` transitively loads the real `manifold-3d` WASM module.
// Statically `vi.mock`-ing "./manifold.engine"/"./cavityDistanceField.engine"
// does not reliably intercept this orchestrator's own binding to that module
// in this environment -- a rejected mock silently never gets called, and the
// REAL engine runs instead, which happens to produce the same
// `implementationMethod` strings as these fixtures for every *successful*
// case, masking the fact that mocking never worked at all. A genuine
// deterministic failure (this suite's whole point) can never be forced that
// way. `createAutomaticCavityTool`'s own injectable `CavityOffsetEngineDeps`
// seam (the same dependency-injection convention already used for
// worker-backed engines elsewhere -- see SplitFaceStoreDeps) is used instead,
// so every test below explicitly proves which engine stub actually ran.
function engineDeps(
  overrides:Partial<CavityOffsetEngineDeps> = {},
):CavityOffsetEngineDeps & {
  readonly createCavityTool:ReturnType<typeof vi.fn>;
  readonly createDistanceFieldCavityTool:ReturnType<typeof vi.fn>;
} {
  return {
    createCavityTool:vi.fn(),
    createDistanceFieldCavityTool:vi.fn(),
    ...overrides,
  } as CavityOffsetEngineDeps & {
    readonly createCavityTool:ReturnType<typeof vi.fn>;
    readonly createDistanceFieldCavityTool:ReturnType<typeof vi.fn>;
  };
}

describe("automatic cavity offset orchestrator",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
  });

  it("uses exact geometry for zero clearance",async()=>{
    const deps=engineDeps();
    deps.createCavityTool.mockResolvedValue(
      cavityTool("exact-watertight-part-solid",0),
    );

    const result=await createAutomaticCavityTool(
      preparedSolid(),
      0,
      "high",
      1e-6,
      deps,
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

    expect(deps.createCavityTool).toHaveBeenCalledTimes(1);
    expect(
      deps.createDistanceFieldCavityTool,
    ).not.toHaveBeenCalled();
  });

  it("uses Minkowski for a simple positive-clearance model",async()=>{
    const deps=engineDeps();
    deps.createCavityTool.mockResolvedValue(
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
      deps,
    );

    expect(result.decision.engine)
      .toBe("direct-minkowski");

    expect(result.tool.implementationMethod)
      .toBe("manifold-minkowski-sphere");

    expect(result.usedFallback).toBe(false);
    expect(deps.createCavityTool).toHaveBeenCalledTimes(1);
    expect(deps.createDistanceFieldCavityTool).not.toHaveBeenCalled();
  });

  it("uses distance field directly for a heavy model",async()=>{
    const deps=engineDeps();
    deps.createDistanceFieldCavityTool
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
      deps,
    );

    expect(result.decision.engine)
      .toBe("distance-field");

    expect(result.tool.implementationMethod)
      .toBe("manifold-level-set-sdf");

    expect(result.usedFallback).toBe(false);

    expect(
      deps.createCavityTool,
    ).not.toHaveBeenCalled();
  });

  it("falls back to distance field when direct Minkowski fails",async()=>{
    const deps=engineDeps();
    deps.createCavityTool.mockRejectedValue(
      new Error("Minkowski failed."),
    );

    deps.createDistanceFieldCavityTool
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
      deps,
    );

    expect(deps.createCavityTool).toHaveBeenCalledTimes(1);
    expect(deps.createDistanceFieldCavityTool).toHaveBeenCalledTimes(1);

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

  it("surfaces a real failure -- never a fabricated success -- when the distance-field fallback engine also fails",async()=>{
    const deps=engineDeps();
    deps.createCavityTool.mockRejectedValue(
      new Error("Minkowski failed."),
    );
    deps.createDistanceFieldCavityTool.mockRejectedValue(
      new Error("Distance field failed too."),
    );

    await expect(
      createAutomaticCavityTool(
        preparedSolid(),
        0.2,
        "high",
        1e-6,
        deps,
      ),
    ).rejects.toThrow("Distance field failed too.");

    expect(deps.createCavityTool).toHaveBeenCalledTimes(1);
    expect(deps.createDistanceFieldCavityTool).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid geometry tolerance before selecting an engine",async()=>{
    const deps=engineDeps();

    await expect(
      createAutomaticCavityTool(
        preparedSolid(),
        0.2,
        "high",
        0,
        deps,
      ),
    ).rejects.toThrow(
      "Automatic cavity geometry tolerance must be positive.",
    );

    expect(
      deps.createCavityTool,
    ).not.toHaveBeenCalled();

    expect(
      deps.createDistanceFieldCavityTool,
    ).not.toHaveBeenCalled();
  });
});
