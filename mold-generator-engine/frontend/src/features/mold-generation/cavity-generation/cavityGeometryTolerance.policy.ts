import type { Bounds3 } from "../split-face/splitFace.contracts";

export const CAVITY_TOLERANCE_POLICY_VERSION="cavity-adaptive-v2";

export interface CavityGeometryTolerancePolicy {
  readonly weldToleranceMm:number;
  readonly booleanToleranceMm:number;
  readonly surfaceToleranceMm:number;
  readonly linearToleranceMm:number;
  /**
   * Floor for comparing a post-Boolean Manifold result's bounds (Float32-backed)
   * against the analytical (Float64) reference mold block. Manifold stores mesh
   * vertices as Float32, so any exported bounding box carries up to ~0.5 ULP of
   * unavoidable rounding at the coordinate's own magnitude -- a value smaller
   * than that is not measuring geometry, it's measuring rounding noise. Kept
   * separate from `linearToleranceMm`/`booleanToleranceMm` (which still govern
   * Float64-vs-Float64 comparisons and Manifold's own weld/merge tolerance) so
   * this fix cannot change Boolean topology.
   */
  readonly containmentToleranceMm:number;
  readonly areaToleranceMm2:number;
  readonly volumeToleranceMm3:number;
  readonly affectedVolumeToleranceMm3:number;
  readonly minimumFragmentVolumeMm3:number;
}

const clamp=(value:number,minimum:number,maximum:number)=>
  Math.min(maximum,Math.max(minimum,value));

/**
 * Empirically-measured single-boundary Float32 rounding error tops out at
 * ~0.5 ULP (the IEEE-754 round-to-nearest maximum). This factor adds headroom
 * for a weld/merge pass plus one Boolean re-triangulation step, each of which
 * can recompute a boundary coordinate from already-Float32-quantized inputs.
 */
const FLOAT32_ULP_SAFETY_FACTOR=4;

const float32UlpBuffer=new ArrayBuffer(4);
const float32UlpView=new Float32Array(float32UlpBuffer);
const float32UlpBits=new Int32Array(float32UlpBuffer);

/** Exact Float32 quantization step at `magnitude`, via bit-level next-representable-value stepping (correct across power-of-two exponent boundaries, unlike a log2-based estimate). */
function float32Ulp(magnitude:number):number{
  const value=Math.fround(Math.abs(magnitude));
  float32UlpView[0]=value;
  float32UlpBits[0]=(float32UlpBits[0]!)+1;
  return float32UlpView[0]!-value;
}

/** Builds conservative, scale-aware millimeter tolerances for one cavity operation. */
export function buildCavityGeometryTolerancePolicy(
  bounds:Bounds3,
  clearanceMm:number,
):CavityGeometryTolerancePolicy {
  const dimensions=[
    bounds.max.x-bounds.min.x,
    bounds.max.y-bounds.min.y,
    bounds.max.z-bounds.min.z,
  ];

  const absoluteCoordinates=[
    bounds.min.x,bounds.max.x,
    bounds.min.y,bounds.max.y,
    bounds.min.z,bounds.max.z,
  ];

  if(
    !dimensions.every(value=>Number.isFinite(value)&&value>0)||
    !absoluteCoordinates.every(Number.isFinite)||
    !Number.isFinite(clearanceMm)||
    clearanceMm<0
  ){
    throw new Error("Cavity tolerance policy inputs are invalid.");
  }

  const diagonal=Math.hypot(...dimensions);
  const minimumDimension=Math.min(...dimensions);
  const featureLimit=Math.max(1e-7,minimumDimension*1e-4);
  const clearanceLimit=clearanceMm>0?clearanceMm*1e-3:featureLimit;
  const linearToleranceMm=clamp(
    diagonal*1e-8,
    1e-7,
    Math.min(1e-3,featureLimit,clearanceLimit),
  );

  // K2 can sit far from the origin even when its own dimensions/diagonal are
  // small (translated-but-modest-size mold), so the Float32 precision floor
  // must be derived from the largest absolute coordinate a mesh vertex will
  // actually carry -- not from `diagonal`, which only reflects extent.
  const maxAbsCoordinateMm=Math.max(...absoluteCoordinates.map(Math.abs));
  const float32PrecisionFloorMm=FLOAT32_ULP_SAFETY_FACTOR*float32Ulp(maxAbsCoordinateMm);
  // The precision floor must win even if it exceeds the diagonal-based upper
  // bound above: a tolerance clamped below Float32's own representable step
  // is exactly the defect being fixed, regardless of how large K2 is.
  const containmentToleranceMm=Math.max(linearToleranceMm,float32PrecisionFloorMm);

  const areaToleranceMm2=linearToleranceMm*linearToleranceMm;
  const volumeToleranceMm3=linearToleranceMm**3;
  const scaleVolume=dimensions[0]!*dimensions[1]!*dimensions[2]!;

  const policy:CavityGeometryTolerancePolicy={
    weldToleranceMm:linearToleranceMm,
    booleanToleranceMm:linearToleranceMm,
    surfaceToleranceMm:Math.min(featureLimit,linearToleranceMm*4),
    linearToleranceMm,
    containmentToleranceMm,
    areaToleranceMm2,
    volumeToleranceMm3,
    affectedVolumeToleranceMm3:Math.max(volumeToleranceMm3,scaleVolume*1e-10),
    minimumFragmentVolumeMm3:Math.max(volumeToleranceMm3*8,scaleVolume*1e-12),
  };

  if(Object.values(policy).some(value=>!Number.isFinite(value)||value<=0)){
    throw new Error("Cavity tolerance policy could not be resolved safely.");
  }

  return Object.freeze(policy);
}
