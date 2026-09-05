import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type Intersection,
  type Object3D,
} from "three";

export const OBJECT_SELECTION_BOX_FACE_VALUES = [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
] as const;

export type ObjectSelectionBoxFace =
  (typeof OBJECT_SELECTION_BOX_FACE_VALUES)[number];

export interface ObjectSelectionBoxBounds {
  readonly min: Readonly<Vector3>;
  readonly max: Readonly<Vector3>;
}

export interface ObjectSelectionBoxFaceDefinition {
  readonly face: ObjectSelectionBoxFace;
  readonly corners: readonly [Vector3, Vector3, Vector3, Vector3];
}

export interface ObjectSelectionBoxRuntime {
  readonly object: LineSegments<BufferGeometry, LineDashedMaterial>;
  clearHoveredFace: () => boolean;
  getBounds: () => ObjectSelectionBoxBounds;
  getHoveredFace: () => ObjectSelectionBoxFace | null;
  setSelectedFaces: (faces: readonly ObjectSelectionBoxFace[]) => boolean;
  updateHoveredFace: (face: ObjectSelectionBoxFace | null) => boolean;
  updateHoveredFaceFromIntersections: (
    intersections: readonly Intersection<Object3D>[],
  ) => boolean;
  updateBounds: (bounds: ObjectSelectionBoxBounds) => void;
  dispose: () => void;
}

const SELECTION_BOX_FACE_USER_DATA_KEY = "selectionBoxFace";

const createSelectionBoxGeometry = (
  bounds: ObjectSelectionBoxBounds,
): BufferGeometry => {
  const { min, max } = bounds;

  const vertices = [
    min.x, min.y, min.z, max.x, min.y, min.z,
    max.x, min.y, min.z, max.x, max.y, min.z,
    max.x, max.y, min.z, min.x, max.y, min.z,
    min.x, max.y, min.z, min.x, min.y, min.z,

    min.x, min.y, max.z, max.x, min.y, max.z,
    max.x, min.y, max.z, max.x, max.y, max.z,
    max.x, max.y, max.z, min.x, max.y, max.z,
    min.x, max.y, max.z, min.x, min.y, max.z,

    min.x, min.y, min.z, min.x, min.y, max.z,
    max.x, min.y, min.z, max.x, min.y, max.z,
    max.x, max.y, min.z, max.x, max.y, max.z,
    min.x, max.y, min.z, min.x, max.y, max.z,
  ];

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingSphere();

  return geometry;
};

export const createObjectSelectionBoxFaceDefinitions = (
  bounds: ObjectSelectionBoxBounds,
): readonly ObjectSelectionBoxFaceDefinition[] => {
  const { min, max } = bounds;

  const v000 = new Vector3(min.x, min.y, min.z);
  const v100 = new Vector3(max.x, min.y, min.z);
  const v110 = new Vector3(max.x, max.y, min.z);
  const v010 = new Vector3(min.x, max.y, min.z);
  const v001 = new Vector3(min.x, min.y, max.z);
  const v101 = new Vector3(max.x, min.y, max.z);
  const v111 = new Vector3(max.x, max.y, max.z);
  const v011 = new Vector3(min.x, max.y, max.z);

  return [
    { face: "front", corners: [v010, v110, v111, v011] },
    { face: "back", corners: [v000, v001, v101, v100] },
    { face: "left", corners: [v000, v010, v011, v001] },
    { face: "right", corners: [v100, v101, v111, v110] },
    { face: "top", corners: [v001, v011, v111, v101] },
    { face: "bottom", corners: [v000, v100, v110, v010] },
  ];
};

const createFaceGeometry = ({
  corners,
}: ObjectSelectionBoxFaceDefinition): BufferGeometry => {
  const [a, b, c, d] = corners;
  const vertices = [
    a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
    a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingSphere();

  return geometry;
};

const createPickMaterial = () =>
  new MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    opacity: 0,
    side: DoubleSide,
    transparent: true,
  });

const createOverlayMaterial = () =>
  new MeshBasicMaterial({
    color: 0x38bdf8,
    depthTest: true,
    depthWrite: false,
    opacity: 0.26,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: DoubleSide,
    transparent: true,
  });

const getIntersectionFace = (
  intersections: readonly Intersection<Object3D>[],
): ObjectSelectionBoxFace | null => {
  for (const intersection of intersections) {
    const face = intersection.object.userData[SELECTION_BOX_FACE_USER_DATA_KEY];

    if (OBJECT_SELECTION_BOX_FACE_VALUES.includes(face)) {
      return face;
    }
  }

  return null;
};

export const createObjectSelectionBoxRuntime = (
  bounds: ObjectSelectionBoxBounds,
): ObjectSelectionBoxRuntime => {
  const material = new LineDashedMaterial({
    color: 0x38bdf8,
    dashSize: 0.35,
    gapSize: 0.22,
    linewidth: 1,
    transparent: true,
    opacity: 0.95,
    depthTest: true,
    depthWrite: false,
  });

  const object = new LineSegments(createSelectionBoxGeometry(bounds), material);
  object.name = "ObjectSelectionBoundingBox";
  object.renderOrder = 20;
  object.computeLineDistances();

  let faceDefinitions = createObjectSelectionBoxFaceDefinitions(bounds);
  let currentBounds: ObjectSelectionBoxBounds = {
    min: bounds.min.clone(),
    max: bounds.max.clone(),
  };
  let pickFaces: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  let hoverOverlay: Mesh<BufferGeometry, MeshBasicMaterial> | null = null;
  let hoveredFace: ObjectSelectionBoxFace | null = null;
  let selectedOverlays: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];

  const clearPickFaces = () => {
    for (const pickFace of pickFaces) {
      pickFace.removeFromParent();
      pickFace.geometry.dispose();
      pickFace.material.dispose();
    }

    pickFaces = [];
  };

  const createPickFaces = () => {
    clearPickFaces();

    pickFaces = faceDefinitions.map((definition) => {
      const pickFace = new Mesh(
        createFaceGeometry(definition),
        createPickMaterial(),
      );
      pickFace.name = `ObjectSelectionBoxFacePick:${definition.face}`;
      pickFace.renderOrder = 19;
      pickFace.userData[SELECTION_BOX_FACE_USER_DATA_KEY] = definition.face;
      object.add(pickFace);

      return pickFace;
    });
  };

  const clearHoveredFace = () => {
    if (hoverOverlay === null) {
      hoveredFace = null;
      return false;
    }

    hoverOverlay.removeFromParent();
    hoverOverlay.geometry.dispose();
    hoverOverlay.material.dispose();
    hoverOverlay = null;
    hoveredFace = null;

    return true;
  };

  const createFaceOverlay = (
    face: ObjectSelectionBoxFace,
    name: string,
    renderOrder: number,
  ) => {
    const definition = faceDefinitions.find((entry) => entry.face === face);

    if (definition === undefined) {
      return null;
    }

    const overlay = new Mesh(createFaceGeometry(definition), createOverlayMaterial());
    overlay.name = name;
    overlay.raycast = () => undefined;
    overlay.renderOrder = renderOrder;
    object.add(overlay);

    return overlay;
  };

  const setSelectedFaces = (faces: readonly ObjectSelectionBoxFace[]) => {
    const current = selectedOverlays.map((overlay) => overlay.userData[SELECTION_BOX_FACE_USER_DATA_KEY]).join(":");
    if (current === faces.join(":")) return false;
    for (const overlay of selectedOverlays) { overlay.removeFromParent(); overlay.geometry.dispose(); overlay.material.dispose(); }
    selectedOverlays = faces.flatMap((face) => {
      const overlay = createFaceOverlay(face, `ObjectSelectionBoxFaceSelected:${face}`, 23);
      if (overlay === null) return [];
      overlay.material.opacity = 0.34;
      overlay.userData[SELECTION_BOX_FACE_USER_DATA_KEY] = face;
      return [overlay];
    });
    return true;
  };

  const updateHoveredFace = (face: ObjectSelectionBoxFace | null) => {
    if (face === hoveredFace) {
      return false;
    }

    const hadOverlay = clearHoveredFace();

    if (face === null) {
      return hadOverlay;
    }

    hoverOverlay = createFaceOverlay(
      face,
      `ObjectSelectionBoxFaceHover:${face}`,
      21,
    );

    if (hoverOverlay === null) {
      hoveredFace = null;
      return hadOverlay;
    }

    hoveredFace = face;

    return true;
  };

  createPickFaces();

  return {
    object,
    clearHoveredFace,
    getBounds: () => ({
      min: currentBounds.min.clone(),
      max: currentBounds.max.clone(),
    }),
    getHoveredFace: () => hoveredFace,
    setSelectedFaces,
    updateHoveredFace,
    updateHoveredFaceFromIntersections: (intersections) =>
      updateHoveredFace(getIntersectionFace(intersections)),
    updateBounds: (nextBounds: ObjectSelectionBoxBounds) => {
      clearHoveredFace();
      setSelectedFaces([]);
      clearPickFaces();
      object.geometry.dispose();
      object.geometry = createSelectionBoxGeometry(nextBounds);
      object.computeLineDistances();
      currentBounds = {
        min: nextBounds.min.clone(),
        max: nextBounds.max.clone(),
      };
      faceDefinitions = createObjectSelectionBoxFaceDefinitions(nextBounds);
      createPickFaces();
    },
    dispose: () => {
      clearHoveredFace();
      setSelectedFaces([]);
      clearPickFaces();
      object.geometry.dispose();
      object.material.dispose();
    },
  };
};
