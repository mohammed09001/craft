import type {
  CavityQualityMode,
  WatertightPartSolid,
} from "./cavityGeneration.contracts";

export type CavityOffsetEngineKind =
  | "exact-zero-clearance"
  | "direct-minkowski"
  | "distance-field";

export type CavityEstimatedCost =
  | "low"
  | "medium"
  | "high";

export type CavityEngineReasonCode =
  | "zero_clearance_exact_geometry"
  | "positive_clearance_requested"
  | "triangle_count_direct"
  | "triangle_count_high"
  | "multiple_components"
  | "high_triangle_density"
  | "extreme_aspect_ratio"
  | "complexity_score_direct"
  | "complexity_score_distance_field"
  | "high_quality_requested";

export interface CavityComplexityMetrics {
  readonly triangleCount:number;
  readonly connectedComponentCount:number;
  readonly requestedClearanceMm:number;
  readonly qualityMode:CavityQualityMode;
  readonly boundsDiagonalMm?:number;
  readonly smallestDimensionMm?:number;
  readonly volumeMm3?:number;
}

export interface CavityEngineDecision {
  readonly engine:CavityOffsetEngineKind;
  readonly complexityScore:number;
  readonly estimatedCost:CavityEstimatedCost;
  readonly reasonCodes:readonly CavityEngineReasonCode[];
}

export const DIRECT_MINKOWSKI_TRIANGLE_LIMIT=50_000;
export const HEAVY_MODEL_TRIANGLE_REFERENCE=250_000;
export const DISTANCE_FIELD_COMPLEXITY_THRESHOLD=0.35;

function clamp01(value:number):number {
  return Math.min(1,Math.max(0,value));
}

export function calculateCavityComplexityScore(
  metrics:CavityComplexityMetrics,
):number {
  if(
    !Number.isFinite(metrics.triangleCount)||
    metrics.triangleCount<0||
    !Number.isFinite(metrics.connectedComponentCount)||
    metrics.connectedComponentCount<1||
    !Number.isFinite(metrics.requestedClearanceMm)||
    metrics.requestedClearanceMm<0
  ){
    throw new Error(
      "Cavity complexity metrics are invalid.",
    );
  }

  if(metrics.requestedClearanceMm===0){
    return 0;
  }

  const triangleScore=clamp01(
    metrics.triangleCount/
      HEAVY_MODEL_TRIANGLE_REFERENCE,
  );

  const componentScore=clamp01(
    (metrics.connectedComponentCount-1)/3,
  );

  const clearanceScore=clamp01(
    metrics.requestedClearanceMm/1,
  );

  const qualityScore=
    metrics.qualityMode==="high"
      ?1
      :0;
  const densityScore=metrics.volumeMm3&&metrics.volumeMm3>0
    ?clamp01((metrics.triangleCount/Math.cbrt(metrics.volumeMm3))/25_000)
    :0;
  const aspectScore=metrics.boundsDiagonalMm&&metrics.smallestDimensionMm&&metrics.smallestDimensionMm>0
    ?clamp01((metrics.boundsDiagonalMm/metrics.smallestDimensionMm-4)/20)
    :0;

  return clamp01(
    triangleScore*0.55+
    componentScore*0.15+
    clearanceScore*0.1+
    qualityScore*0.05+
    densityScore*0.1+
    aspectScore*0.05,
  );
}

export function selectCavityOffsetEngine(
  metrics:CavityComplexityMetrics,
):CavityEngineDecision {
  const complexityScore=
    calculateCavityComplexityScore(metrics);

  if(metrics.requestedClearanceMm===0){
    return {
      engine:"exact-zero-clearance",
      complexityScore:0,
      estimatedCost:"low",
      reasonCodes:[
        "zero_clearance_exact_geometry",
      ],
    };
  }

  const reasonCodes:CavityEngineReasonCode[]=[
    "positive_clearance_requested",
  ];

  if(metrics.qualityMode==="high"){
    reasonCodes.push("high_quality_requested");
  }

  if(
    metrics.triangleCount>
      DIRECT_MINKOWSKI_TRIANGLE_LIMIT
  ){
    reasonCodes.push("triangle_count_high");
  }else{
    reasonCodes.push("triangle_count_direct");
  }

  if(metrics.connectedComponentCount>1){
    reasonCodes.push("multiple_components");
  }
  if(metrics.volumeMm3&&metrics.triangleCount/Math.cbrt(metrics.volumeMm3)>25_000)reasonCodes.push("high_triangle_density");
  if(metrics.boundsDiagonalMm&&metrics.smallestDimensionMm&&metrics.boundsDiagonalMm/metrics.smallestDimensionMm>20)reasonCodes.push("extreme_aspect_ratio");

  const shouldUseDistanceField=
    metrics.triangleCount>
      DIRECT_MINKOWSKI_TRIANGLE_LIMIT||
    metrics.connectedComponentCount>1||
    reasonCodes.includes("high_triangle_density")||
    reasonCodes.includes("extreme_aspect_ratio")||
    complexityScore>=
      DISTANCE_FIELD_COMPLEXITY_THRESHOLD;

  if(shouldUseDistanceField){
    reasonCodes.push(
      "complexity_score_distance_field",
    );

    return {
      engine:"distance-field",
      complexityScore,
      estimatedCost:"high",
      reasonCodes,
    };
  }

  reasonCodes.push("complexity_score_direct");

  return {
    engine:"direct-minkowski",
    complexityScore,
    estimatedCost:
      complexityScore<0.2
        ?"low"
        :"medium",
    reasonCodes,
  };
}

export function selectCavityOffsetEngineForPreparedSolid(
  prepared:WatertightPartSolid,
  requestedClearanceMm:number,
  qualityMode:CavityQualityMode,
):CavityEngineDecision {
  const dimensions=[prepared.bounds.max.x-prepared.bounds.min.x,prepared.bounds.max.y-prepared.bounds.min.y,prepared.bounds.max.z-prepared.bounds.min.z];
  return selectCavityOffsetEngine({
    triangleCount:prepared.triangleCount,
    connectedComponentCount:
      prepared.connectedComponentCount,
    requestedClearanceMm,
    qualityMode,
    boundsDiagonalMm:Math.hypot(...dimensions),
    smallestDimensionMm:Math.min(...dimensions),
    volumeMm3:prepared.volumeMm3,
  });
}
