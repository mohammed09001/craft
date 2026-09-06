import { create } from "zustand";

import { useSplitFaceStore } from "@/features/mold-generation/split-face/splitFace.store";
import { useModelImportStore } from "@/features/viewport/modelImport.store";

export interface PartOrientation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export type PartFlipDirection =
  | "left"
  | "right"
  | "forward"
  | "backward"
  | "upside-down";

export interface PartOrientationCapability {
  readonly available: boolean;
  readonly reason: string | null;
}

export const IDENTITY_PART_ORIENTATION: PartOrientation = Object.freeze({
  x: 0,
  y: 0,
  z: 0,
  w: 1,
});

const LOCKED_AFTER_GENERATION_MESSAGE =
  "Model orientation is locked after mold generation. Return to the pre-mold stage to change the model orientation.";
const QUARTER_TURN_COMPONENT = Math.SQRT1_2;
const ORIENTATION_SNAP_EPSILON = 1e-12;

const PART_FLIP_STEPS: Readonly<Record<PartFlipDirection, PartOrientation>> = {
  left: { x: 0, y: -QUARTER_TURN_COMPONENT, z: 0, w: QUARTER_TURN_COMPONENT },
  right: { x: 0, y: QUARTER_TURN_COMPONENT, z: 0, w: QUARTER_TURN_COMPONENT },
  forward: { x: -QUARTER_TURN_COMPONENT, y: 0, z: 0, w: QUARTER_TURN_COMPONENT },
  backward: { x: QUARTER_TURN_COMPONENT, y: 0, z: 0, w: QUARTER_TURN_COMPONENT },
  "upside-down": { x: 1, y: 0, z: 0, w: 0 },
};

export function getPartOrientationCapability(): PartOrientationCapability {
  if (useModelImportStore.getState().status.phase !== "ready") {
    return {
      available: false,
      reason: "Import a valid model before changing its orientation.",
    };
  }

  const mold = useSplitFaceStore.getState();
  const hasGeneratedGeometry =
    mold.definition !== null ||
    mold.lastCommittedResult !== null ||
    mold.cavity.result !== null ||
    mold.sprueDefinitions.length > 0 ||
    mold.registration.status === "generated";

  if (hasGeneratedGeometry) {
    return { available: false, reason: LOCKED_AFTER_GENERATION_MESSAGE };
  }

  const processActive =
    mold.workflow === "draggingPlane" ||
    mold.workflow === "generatingParts" ||
    mold.evaluation.phase === "evaluating" ||
    mold.cavity.status === "generating" ||
    mold.sprueStatus === "generating";

  if (processActive) {
    return {
      available: false,
      reason: "Model orientation is unavailable while an engineering operation is active.",
    };
  }

  return { available: true, reason: null };
}

function normalizeOrientation(
  orientation: PartOrientation,
): PartOrientation | null {
  const values = [
    orientation.x,
    orientation.y,
    orientation.z,
    orientation.w,
  ];

  if (!values.every(Number.isFinite)) {
    return null;
  }

  const length = Math.hypot(...values);
  if (length <= Number.EPSILON) {
    return null;
  }

  return Object.freeze({
    x: orientation.x / length,
    y: orientation.y / length,
    z: orientation.z / length,
    w: orientation.w / length,
  });
}

function snapOrientationComponent(value: number) {
  if (Math.abs(value) <= ORIENTATION_SNAP_EPSILON) {
    return 0;
  }
  if (Math.abs(value - 1) <= ORIENTATION_SNAP_EPSILON) {
    return 1;
  }
  if (Math.abs(value + 1) <= ORIENTATION_SNAP_EPSILON) {
    return -1;
  }
  return value;
}

export function composePartFlip(
  orientation: PartOrientation,
  direction: PartFlipDirection,
): PartOrientation {
  const step = PART_FLIP_STEPS[direction];
  const composed = normalizeOrientation({
    x:
      step.w * orientation.x +
      step.x * orientation.w +
      step.y * orientation.z -
      step.z * orientation.y,
    y:
      step.w * orientation.y -
      step.x * orientation.z +
      step.y * orientation.w +
      step.z * orientation.x,
    z:
      step.w * orientation.z +
      step.x * orientation.y -
      step.y * orientation.x +
      step.z * orientation.w,
    w:
      step.w * orientation.w -
      step.x * orientation.x -
      step.y * orientation.y -
      step.z * orientation.z,
  });

  if (composed === null) {
    return IDENTITY_PART_ORIENTATION;
  }

  const snapped = {
    x: snapOrientationComponent(composed.x),
    y: snapOrientationComponent(composed.y),
    z: snapOrientationComponent(composed.z),
    w: snapOrientationComponent(composed.w),
  };
  const signAnchor =
    snapped.w !== 0
      ? snapped.w
      : snapped.x !== 0
        ? snapped.x
        : snapped.y !== 0
          ? snapped.y
          : snapped.z;
  const sign = signAnchor < 0 ? -1 : 1;

  return Object.freeze({
    x: snapped.x * sign,
    y: snapped.y * sign,
    z: snapped.z * sign,
    w: snapped.w * sign,
  });
}

interface PartOrientationState {
  readonly orientation: PartOrientation;
  readonly revision: number;
  commitOrientation(orientation: PartOrientation): boolean;
  flipOrientation(direction: PartFlipDirection): boolean;
  resetOrientation(): boolean;
  resetForModelReplacement(): void;
}

export const usePartOrientationStore = create<PartOrientationState>(
  (set, get) => ({
    orientation: IDENTITY_PART_ORIENTATION,
    revision: 0,
    commitOrientation: (orientation) => {
      if (!getPartOrientationCapability().available) {
        return false;
      }

      const normalized = normalizeOrientation(orientation);
      if (normalized === null) {
        return false;
      }

      const current = get().orientation;
      if (
        current.x === normalized.x &&
        current.y === normalized.y &&
        current.z === normalized.z &&
        current.w === normalized.w
      ) {
        return true;
      }

      set((state) => ({
        orientation: normalized,
        revision: state.revision + 1,
      }));
      return true;
    },
    flipOrientation: (direction) =>
      get().commitOrientation(composePartFlip(get().orientation, direction)),
    resetOrientation: () =>
      get().commitOrientation(IDENTITY_PART_ORIENTATION),
    resetForModelReplacement: () =>
      set((state) => ({
        orientation: IDENTITY_PART_ORIENTATION,
        revision: state.revision + 1,
      })),
  }),
);
