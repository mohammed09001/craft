import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix3,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Ray,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
} from "three";

import {
  DEFAULT_SPRUE_ENTRY_NECK_DIAMETER_MM,
  resolveSprueIntegration,
  SPRUE_CIRCULAR_SEGMENTS,
  type SpruePreviewPlacement,
} from "@/features/mold-generation/sprue-generation";
import type { CavityToolData } from "@/features/mold-generation/cavity-generation/cavityGeneration.contracts";
import {
  createPointerGesture,
  isClickCandidate,
  normalizePointerToNdc,
  updatePointerGesture,
  type PointerGesture,
} from "@/features/viewport/runtime/pointerSelection";

const GLASS_OPACITY = 0.28;
const TOP_NORMAL_MIN_DOT = 0.9;
const SURFACE_TOLERANCE_MM = 1e-4;
const RAY_ORIGIN_OFFSET_MM = 1e-5;
const FUNNEL_HEIGHT_MM = 5;
const FUNNEL_INLET_RADIUS_MM = 4;
const STEM_RADIUS_MM = DEFAULT_SPRUE_ENTRY_NECK_DIAMETER_MM / 2;
const INVALID_COLOR = 0xb33a36;
const VALID_COLOR = 0x31975a;

type MaterialSnapshot = {
  readonly depthWrite: boolean;
  readonly opacity: number;
  readonly transparent: boolean;
};

export interface SpruePreview3dRuntime {
  readonly object: Group;
  clearPreview(): void;
  dispose(): void;
  getPlacement(): SpruePreviewPlacement | null;
  setActive(active: boolean): void;
  setCavityGeometry(cavityTool: CavityToolData | null): void;
  setMoldRoot(root: Object3D | null): void;
  updateFromRay(ray: Ray): SpruePreviewPlacement | null;
}

export function isMoldBodyMesh(object: Object3D): object is Mesh<BufferGeometry, Material> {
  return (
    object instanceof Mesh &&
    typeof object.userData.moldBodyId === "string" &&
    object.userData.cavityAffected !== false
  );
}

function pointSnapshot(point: Vector3) {
  return { x: point.x, y: point.y, z: point.z };
}

/** Owns visual validity, canonical placement snapshots, and Sprue click gestures. */
export function createSpruePreview3dRuntime(options: {
  readonly camera: Camera;
  readonly canvas: HTMLCanvasElement;
  readonly invalidate: () => void;
  readonly onValidPlacementClick?: (placement: SpruePreviewPlacement) => void;
}): SpruePreview3dRuntime {
  const { camera, canvas, invalidate, onValidPlacementClick } = options;
  const object = new Group();
  object.name = "SpruePreview3d";
  object.visible = false;
  object.userData.spruePreview = true;

  const material = new MeshStandardMaterial({
    color: INVALID_COLOR,
    metalness: 0.05,
    opacity: 0.86,
    roughness: 0.44,
    transparent: true,
    depthWrite: true,
  });
  const funnel = new Mesh(
    new CylinderGeometry(
      FUNNEL_INLET_RADIUS_MM,
      STEM_RADIUS_MM,
      FUNNEL_HEIGHT_MM,
      24,
      1,
      false,
    ),
    material,
  );
  funnel.name = "SpruePreviewFunnel";
  funnel.userData.spruePreview = true;
  const mainStem = new Mesh(
    new CylinderGeometry(
      STEM_RADIUS_MM,
      STEM_RADIUS_MM,
      1,
      SPRUE_CIRCULAR_SEGMENTS,
    ),
    material,
  );
  mainStem.name = "SpruePreviewStem";
  mainStem.userData.spruePreview = true;

  const entryNeck = new Mesh(
    new CylinderGeometry(
      STEM_RADIUS_MM,
      STEM_RADIUS_MM,
      1,
      SPRUE_CIRCULAR_SEGMENTS,
    ),
    material,
  );
  entryNeck.name = "SpruePreviewEntryNeck";
  entryNeck.userData.spruePreview = true;
  entryNeck.visible = false;

  object.add(funnel, mainStem, entryNeck);

  const pointerNdc = new Vector2();
  const pointerRaycaster = new Raycaster();
  const cavityRaycaster = new Raycaster();
  const localPoint = new Vector3();
  const localEndPoint = new Vector3();
  const canonicalPoint = new Vector3();
  const outward = new Vector3();
  const inward = new Vector3();
  const axis = new Vector3(0, 1, 0);
  const normalMatrix = new Matrix3();
  const orientation = new Quaternion();
  const moldTargets: Mesh<BufferGeometry, Material>[] = [];
  const materialSnapshots = new Map<Material, MaterialSnapshot>();
  const glassEdges: LineSegments[] = [];
  let moldRoot: Object3D | null = null;
  let cavityTarget: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  let cavityToolData: CavityToolData | null = null;
  let placement: SpruePreviewPlacement | null = null;
  let clickPlacement: SpruePreviewPlacement | null = null;
  let gesture: PointerGesture | null = null;
  let visualStatus: SpruePreviewPlacement["status"] = "invalid";
  let active = false;
  let disposed = false;

  function setVisualStatus(status: SpruePreviewPlacement["status"]) {
    if (visualStatus === status) return;
    visualStatus = status;
    material.color.setHex(status === "valid" ? VALID_COLOR : INVALID_COLOR);
  }

  function resolvePreviewProfileDesign(totalSprueLengthMm: number) {
    if (cavityToolData === null) {
      return resolveSprueIntegration({
        cavityVolumeMm3: 0,
        cavityBounds: { xLengthMm: 0, yLengthMm: 0, zLengthMm: 0 },
        totalSprueLengthMm,
      }).design;
    }

    const { bounds } = cavityToolData;

    return resolveSprueIntegration({
      cavityVolumeMm3: cavityToolData.volumeMm3,
      cavityBounds: {
        xLengthMm: bounds.max.x - bounds.min.x,
        yLengthMm: bounds.max.y - bounds.min.y,
        zLengthMm: bounds.max.z - bounds.min.z,
      },
      totalSprueLengthMm,
    }).design;
  }

  function hide() {
    placement = null;
    clickPlacement = null;
    setVisualStatus("invalid");
    if (!object.visible) return;
    object.visible = false;
    invalidate();
  }

  function restoreGlass() {
    for (const [moldMaterial, snapshot] of materialSnapshots) {
      moldMaterial.depthWrite = snapshot.depthWrite;
      moldMaterial.opacity = snapshot.opacity;
      moldMaterial.transparent = snapshot.transparent;
      moldMaterial.needsUpdate = true;
    }
    materialSnapshots.clear();
    for (const edges of glassEdges.splice(0)) {
      edges.removeFromParent();
      edges.geometry.dispose();
      (edges.material as Material).dispose();
    }
  }

  function applyGlass() {
    restoreGlass();
    if (!active) {
      invalidate();
      return;
    }
    for (const target of moldTargets) {
      const materials = Array.isArray(target.material)
        ? target.material
        : [target.material];
      for (const moldMaterial of materials) {
        if (!materialSnapshots.has(moldMaterial)) {
          materialSnapshots.set(moldMaterial, {
            depthWrite: moldMaterial.depthWrite,
            opacity: moldMaterial.opacity,
            transparent: moldMaterial.transparent,
          });
        }
        moldMaterial.opacity = GLASS_OPACITY;
        moldMaterial.transparent = true;
        moldMaterial.depthWrite = false;
        moldMaterial.needsUpdate = true;
      }

      const edges = new LineSegments(
        new EdgesGeometry(target.geometry),
        new LineBasicMaterial({
          color: 0x762d34,
          opacity: 0.78,
          transparent: true,
          depthWrite: false,
        }),
      );
      edges.name = "SprueGlassEdges";
      edges.renderOrder = 9;
      edges.raycast = () => undefined;
      edges.userData.spruePreviewHelper = true;
      target.add(edges);
      glassEdges.push(edges);
    }
    invalidate();
  }

  function collectMoldTargets() {
    moldTargets.length = 0;
    moldRoot?.traverse((descendant) => {
      if (isMoldBodyMesh(descendant) && descendant.visible) {
        moldTargets.push(descendant);
      }
    });
  }

  function placePreview(
    entry: Vector3,
    end: Vector3,
    inwardDirection: Vector3,
    nextPlacement: SpruePreviewPlacement,
  ) {
    const length = entry.distanceTo(end);
    if (!Number.isFinite(length) || length <= SURFACE_TOLERANCE_MM) {
      hide();
      return null;
    }

    const profile = nextPlacement.profileDesign.profile;
    const mainRadiusMm = profile.mainDiameterMm / 2;
    const entryNeckRadiusMm =
      profile.entryNeckDiameterMm / 2;
    const entryNeckLengthMm = Math.min(
      profile.entryNeckLengthMm,
      length,
    );
    const mainStemLengthMm = Math.max(0, length - entryNeckLengthMm);
    const mainRadialScale = mainRadiusMm / STEM_RADIUS_MM;
    const entryNeckRadialScale = entryNeckRadiusMm / STEM_RADIUS_MM;

    inward.copy(inwardDirection).normalize();
    outward.copy(inward).negate();

    orientation.setFromUnitVectors(axis, outward);
    funnel.quaternion.copy(orientation);
    funnel.position.copy(entry).addScaledVector(outward, FUNNEL_HEIGHT_MM / 2);
    funnel.scale.set(mainRadialScale, 1, mainRadialScale);
    funnel.updateMatrix();

    orientation.setFromUnitVectors(axis, inward);

    mainStem.quaternion.copy(orientation);
    mainStem.position
      .copy(entry)
      .addScaledVector(inward, mainStemLengthMm / 2);
    mainStem.scale.set(
      mainRadialScale,
      Math.max(mainStemLengthMm, SURFACE_TOLERANCE_MM),
      mainRadialScale,
    );
    mainStem.visible = mainStemLengthMm > SURFACE_TOLERANCE_MM;
    mainStem.updateMatrix();

    entryNeck.quaternion.copy(orientation);
    entryNeck.position
      .copy(entry)
      .addScaledVector(
        inward,
        mainStemLengthMm + entryNeckLengthMm / 2,
      );
    entryNeck.scale.set(
      entryNeckRadialScale,
      Math.max(entryNeckLengthMm, SURFACE_TOLERANCE_MM),
      entryNeckRadialScale,
    );
    entryNeck.visible = entryNeckLengthMm > SURFACE_TOLERANCE_MM;
    entryNeck.updateMatrix();

    placement = nextPlacement;
    setVisualStatus(nextPlacement.status);
    object.visible = true;
    invalidate();
    return nextPlacement;
  }

  function updateFromRay(ray: Ray): SpruePreviewPlacement | null {
    if (!active || moldRoot === null || moldTargets.length === 0) {
      hide();
      return null;
    }

    moldRoot.updateWorldMatrix(true, true);
    pointerRaycaster.ray.copy(ray);
    const topHit = pointerRaycaster.intersectObjects(moldTargets, false)[0];
    if (topHit === undefined || !isMoldBodyMesh(topHit.object)) {
      hide();
      return null;
    }

    const body = topHit.object;
    if (body.geometry.boundingBox === null) body.geometry.computeBoundingBox();
    const bounds = body.geometry.boundingBox;
    localPoint.copy(topHit.point);
    body.worldToLocal(localPoint);
    const canonicalTopZ =
      typeof body.userData.moldTopZ === "number"
        ? body.userData.moldTopZ
        : bounds?.max.z;
    const isTopPlane =
      bounds !== null &&
      canonicalTopZ !== undefined &&
      Math.abs(localPoint.z - canonicalTopZ) <= SURFACE_TOLERANCE_MM;
    const isTopNormal =
      topHit.face != null && topHit.face.normal.z >= TOP_NORMAL_MIN_DOT;
    if (!isTopPlane || !isTopNormal || bounds === null) {
      hide();
      return null;
    }

    normalMatrix.getNormalMatrix(body.matrixWorld);
    inward.set(0, 0, -1).applyMatrix3(normalMatrix).normalize();
    canonicalPoint.copy(topHit.point);
    moldRoot.worldToLocal(canonicalPoint);
    const base = {
      topPoint: pointSnapshot(canonicalPoint),
      inwardDirection: { x: 0, y: 0, z: -1 },
      coordinateSpace: "mold-local" as const,
    };

    if (cavityTarget !== null) {
      cavityTarget.matrixWorld.copy(moldRoot.matrixWorld);
      cavityRaycaster.ray.origin
        .copy(topHit.point)
        .addScaledVector(inward, RAY_ORIGIN_OFFSET_MM);
      cavityRaycaster.ray.direction.copy(inward);
      const cavityHit = cavityRaycaster
        .intersectObject(cavityTarget, false)
        .find((intersection) => intersection.distance > SURFACE_TOLERANCE_MM);
      if (cavityHit !== undefined) {
        canonicalPoint.copy(cavityHit.point);
        moldRoot.worldToLocal(canonicalPoint);
        const stemLengthMm = base.topPoint.z - canonicalPoint.z;
        const profileDesign = resolvePreviewProfileDesign(stemLengthMm);

        return placePreview(topHit.point, cavityHit.point, inward, {
          ...base,
          status: "valid",
          cavityPoint: pointSnapshot(canonicalPoint),
          profileDesign,
          stemLengthMm,
        });
      }
    }

    localEndPoint.set(localPoint.x, localPoint.y, bounds.min.z);
    body.localToWorld(localEndPoint);
    canonicalPoint.copy(localEndPoint);
    moldRoot.worldToLocal(canonicalPoint);
    const stemLengthMm = base.topPoint.z - canonicalPoint.z;
    const profileDesign = resolvePreviewProfileDesign(stemLengthMm);

    return placePreview(topHit.point, localEndPoint, inward, {
      ...base,
      status: "invalid",
      profileDesign,
      stemLengthMm,
    });
  }

  function handlePointerMove(event: PointerEvent) {
    if (!active || !event.isPrimary) return;
    if (gesture?.pointerId === event.pointerId) {
      updatePointerGesture(gesture, event);
    }
    if (event.buttons !== 0) {
      if (gesture?.isDrag === true) hide();
      return;
    }
    const normalized = normalizePointerToNdc(
      event,
      canvas.getBoundingClientRect(),
      pointerNdc,
    );
    if (normalized === null) {
      hide();
      return;
    }
    pointerRaycaster.setFromCamera(normalized, camera);
    updateFromRay(pointerRaycaster.ray);
  }

  function handlePointerDown(event: PointerEvent) {
    if (!active || !event.isPrimary) return;
    gesture = createPointerGesture(event);
    clickPlacement = event.button === 0 ? placement : null;
  }

  function handlePointerUp(event: PointerEvent) {
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const completed = gesture;
    gesture = null;
    const requestedPlacement = clickPlacement;
    clickPlacement = null;
    if (
      completed.button === 0 &&
      isClickCandidate(completed) &&
      requestedPlacement !== null
    ) {
      onValidPlacementClick?.(requestedPlacement);
    }
  }

  function handlePointerCancel() {
    gesture = null;
    hide();
  }

  function handlePointerLeave() {
    gesture = null;
    hide();
  }

  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  canvas.addEventListener("pointercancel", handlePointerCancel);

  return {
    object,
    clearPreview: hide,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      restoreGlass();
      cavityTarget?.geometry.dispose();
      cavityTarget?.material.dispose();
      cavityTarget = null;
      cavityToolData = null;
      moldTargets.length = 0;
      moldRoot = null;
      placement = null;
      gesture = null;
      object.removeFromParent();
      funnel.geometry.dispose();
      mainStem.geometry.dispose();
      entryNeck.geometry.dispose();
      material.dispose();
    },
    getPlacement: () => placement,
    setActive: (nextActive) => {
      if (active === nextActive) return;
      active = nextActive;
      gesture = null;
      hide();
      applyGlass();
    },
    setCavityGeometry: (cavityTool) => {
      hide();
      cavityTarget?.geometry.dispose();
      cavityTarget?.material.dispose();
      cavityTarget = null;
      cavityToolData = cavityTool;
      if (cavityToolData === null) return;
      const mesh = cavityToolData.mesh;
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(mesh.positions), 3),
      );
      geometry.setIndex([...mesh.indices]);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      cavityTarget = new Mesh(
        geometry,
        new MeshBasicMaterial({ side: DoubleSide }),
      );
      cavityTarget.name = "SprueCavityRaycastTarget";
      cavityTarget.matrixAutoUpdate = false;
      cavityTarget.userData.sprueCavityRaycastTarget = true;
    },
    setMoldRoot: (root) => {
      hide();
      restoreGlass();
      moldRoot = root;
      collectMoldTargets();
      applyGlass();
    },
    updateFromRay,
  };
}






