import type {
  CavityQualityMode,
  WatertightPartSolid,
} from "./cavityGeneration.contracts";

export interface DistanceFieldBounds {
  readonly min:readonly [number,number,number];
  readonly max:readonly [number,number,number];
}

export interface DistanceFieldQualityProfile {
  readonly qualityMode:CavityQualityMode;
  readonly requestedClearanceMm:number;
  readonly targetEdgeLengthMm:number;
  readonly effectiveEdgeLengthMm:number;
  readonly surfaceToleranceMm:number;
  readonly maximumAxisCells:number;
  readonly boundsPaddingMm:number;
  readonly bounds:DistanceFieldBounds;
  readonly estimatedGridDimensions:
    readonly [number,number,number];
  readonly estimatedGridCellCount:number;
  readonly maximumGridCellCount:number;
  readonly exceedsGridBudget:boolean;
}

const STANDARD_TARGET_EDGE_LENGTH_MM=0.8;
const HIGH_TARGET_EDGE_LENGTH_MM=0.4;

const STANDARD_MAXIMUM_AXIS_CELLS=256;
const HIGH_MAXIMUM_AXIS_CELLS=384;

const STANDARD_MAXIMUM_GRID_CELL_COUNT=12_000_000;
const HIGH_MAXIMUM_GRID_CELL_COUNT=24_000_000;

function axisLength(
  minimum:number,
  maximum:number,
):number {
  return maximum-minimum;
}

function ceilPositive(value:number):number {
  return Math.max(1,Math.ceil(value));
}

export function buildDistanceFieldQualityProfile(
  prepared:WatertightPartSolid,
  requestedClearanceMm:number,
  qualityMode:CavityQualityMode,
  geometryToleranceMm:number,
):DistanceFieldQualityProfile {
  if(
    !Number.isFinite(requestedClearanceMm)||
    requestedClearanceMm<=0
  ){
    throw new Error(
      "Distance-field clearance must be positive.",
    );
  }

  if(
    !Number.isFinite(geometryToleranceMm)||
    geometryToleranceMm<=0
  ){
    throw new Error(
      "Distance-field geometry tolerance must be positive.",
    );
  }

  const sizeX=axisLength(
    prepared.bounds.min.x,
    prepared.bounds.max.x,
  );

  const sizeY=axisLength(
    prepared.bounds.min.y,
    prepared.bounds.max.y,
  );

  const sizeZ=axisLength(
    prepared.bounds.min.z,
    prepared.bounds.max.z,
  );

  if(
    ![sizeX,sizeY,sizeZ].every(
      value=>
        Number.isFinite(value)&&
        value>0,
    )
  ){
    throw new Error(
      "Distance-field source bounds are invalid.",
    );
  }

  const targetEdgeLengthMm=Math.max(
    qualityMode==="high"
      ?HIGH_TARGET_EDGE_LENGTH_MM
      :STANDARD_TARGET_EDGE_LENGTH_MM,
    requestedClearanceMm*(qualityMode==="high"?0.5:1),
  );

  const maximumAxisCells=
    qualityMode==="high"
      ?HIGH_MAXIMUM_AXIS_CELLS
      :STANDARD_MAXIMUM_AXIS_CELLS;

  const maximumGridCellCount=
    qualityMode==="high"
      ?HIGH_MAXIMUM_GRID_CELL_COUNT
      :STANDARD_MAXIMUM_GRID_CELL_COUNT;

  const longestAxisMm=Math.max(
    sizeX,
    sizeY,
    sizeZ,
  );

  const boundedEdgeLengthMm=
    longestAxisMm/maximumAxisCells;

  const effectiveEdgeLengthMm=Math.max(
    geometryToleranceMm,
    targetEdgeLengthMm,
    boundedEdgeLengthMm,
  );

  const boundsPaddingMm=
    requestedClearanceMm+
    effectiveEdgeLengthMm*2;

  const bounds:DistanceFieldBounds={
    min:[
      prepared.bounds.min.x-boundsPaddingMm,
      prepared.bounds.min.y-boundsPaddingMm,
      prepared.bounds.min.z-boundsPaddingMm,
    ],
    max:[
      prepared.bounds.max.x+boundsPaddingMm,
      prepared.bounds.max.y+boundsPaddingMm,
      prepared.bounds.max.z+boundsPaddingMm,
    ],
  };

  const expandedSizeX=
    bounds.max[0]-bounds.min[0];

  const expandedSizeY=
    bounds.max[1]-bounds.min[1];

  const expandedSizeZ=
    bounds.max[2]-bounds.min[2];

  const estimatedGridDimensions:
    readonly [number,number,number]=[
      ceilPositive(
        expandedSizeX/effectiveEdgeLengthMm,
      ),
      ceilPositive(
        expandedSizeY/effectiveEdgeLengthMm,
      ),
      ceilPositive(
        expandedSizeZ/effectiveEdgeLengthMm,
      ),
    ];

  const estimatedGridCellCount=
    estimatedGridDimensions[0]*
    estimatedGridDimensions[1]*
    estimatedGridDimensions[2];

  const surfaceToleranceMm=Math.max(
    geometryToleranceMm,
    effectiveEdgeLengthMm*0.25,
  );

  return {
    qualityMode,
    requestedClearanceMm,
    targetEdgeLengthMm,
    effectiveEdgeLengthMm,
    surfaceToleranceMm,
    maximumAxisCells,
    boundsPaddingMm,
    bounds,
    estimatedGridDimensions,
    estimatedGridCellCount,
    maximumGridCellCount,
    exceedsGridBudget:
      estimatedGridCellCount>
      maximumGridCellCount,
  };
}

