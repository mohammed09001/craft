import { Box3, Group, Vector3, type Object3D } from "three";

import type { PartOrientation } from "@/features/viewport/partOrientation.store";

export interface PartOrientation3dRuntime {
  readonly object: Group;
  hasTarget(): boolean;
  releaseTarget(): void;
  setOrientation(orientation: PartOrientation): void;
  setTarget(target: Group | null, centerSource?: Object3D | null): void;
  dispose(): void;
}

export function createPartOrientation3dRuntime(): PartOrientation3dRuntime {
  const object = new Group();
  object.name = "Part Orientation Runtime";

  const pivot = new Group();
  pivot.name = "Part Orientation Pivot";
  object.add(pivot);

  let target: Group | null = null;
  let targetOriginalParent: Object3D | null = null;
  let approvedOrientation: PartOrientation = { x: 0, y: 0, z: 0, w: 1 };

  const detachTargetFromPivot = () => {
    if (
      target !== null &&
      target.parent === pivot &&
      targetOriginalParent !== null
    ) {
      targetOriginalParent.attach(target);
    }
    targetOriginalParent = null;
  };

  const attachTargetToCenteredPivot = (
    nextTarget: Group,
    centerSource: Object3D,
  ) => {
    nextTarget.updateWorldMatrix(true, true);
    centerSource.updateWorldMatrix(true, true);
    const center = new Box3().setFromObject(centerSource).getCenter(new Vector3());
    pivot.position.copy(center);
    pivot.quaternion.set(
      approvedOrientation.x,
      approvedOrientation.y,
      approvedOrientation.z,
      approvedOrientation.w,
    );
    pivot.updateWorldMatrix(true, true);
    targetOriginalParent = nextTarget.parent;
    pivot.attach(nextTarget);
    pivot.updateWorldMatrix(true, true);
  };

  return {
    object,
    hasTarget: () => target !== null,
    releaseTarget: detachTargetFromPivot,
    setOrientation: (orientation) => {
      approvedOrientation = orientation;
    },
    setTarget: (nextTarget, centerSource = nextTarget) => {
      detachTargetFromPivot();
      target = nextTarget;
      if (target !== null && centerSource !== null) {
        attachTargetToCenteredPivot(target, centerSource);
      }
    },
    dispose: () => {
      detachTargetFromPivot();
      target = null;
      object.removeFromParent();
    },
  };
}
