import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Sprite,
  SpriteMaterial,
  type PerspectiveCamera,
} from "three";

import { DEFAULT_GRID_CONFIG } from "@/features/viewport/runtime/adaptiveGrid";
import type { AdaptiveGridConfig } from "@/features/viewport/runtime/adaptiveGrid";
import {
  computeGroundPlaneRulerLayout,
  formatRulerLabel,
  projectWorldLengthToPixels,
  rulerStepBounds,
  selectRulerLabelStep,
} from "@/features/viewport/runtime/groundPlaneRuler";
import { createRulerLabelTexture } from "@/features/viewport/runtime/rulerLabelTexture";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

const AXIS_Z = 0;
const LABEL_Z = 0.5;
const LABEL_PIXEL_HEIGHT = 12;
const LABEL_OFFSET_PIXELS = 14;
const MAJOR_TICK_PIXELS = 8;
const MINOR_TICK_PIXELS = 4;

type GroundPlaneRulerRuntimeOptions = {
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  palette: ViewportPalette;
  invalidate: () => void;
};

export type GroundPlaneRulerRuntime = {
  readonly object: Group;
  setGridConfig(config: AdaptiveGridConfig): void;
  updateForCamera(): void;
  setPalette(palette: ViewportPalette): void;
  dispose(): void;
};

function deriveRulerLabelColor(palette: ViewportPalette): number {
  const isLight =
    new Color(palette.background).getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;

  return isLight ? 0x1d4ed8 : 0xfbbf24;
}

export function createGroundPlaneRulerRuntime({
  camera,
  canvas,
  palette: initialPalette,
  invalidate,
}: GroundPlaneRulerRuntimeOptions): GroundPlaneRulerRuntime {
  const root = new Group();
  root.name = "Ground Plane Ruler";
  root.raycast = () => undefined;
  root.userData.passiveVisualLayer = true;

  let gridConfig: AdaptiveGridConfig = DEFAULT_GRID_CONFIG;
  let labelColor = deriveRulerLabelColor(initialPalette);
  let currentStep: number | null = null;
  let dirty = true;
  let disposed = false;

  const axisMaterial = new LineBasicMaterial({
    color: initialPalette.gridMajor,
    transparent: true,
    // Axes and ticks support spatial orientation; labels remain the
    // deliberate engineering emphasis without turning the empty scene into
    // a dense visual field.
    opacity: 0.66,
  });
  const tickMaterial = new LineBasicMaterial({
    color: initialPalette.gridMinor,
    transparent: true,
    opacity: 0.52,
  });

  const disposeVisuals = () => {
    for (const child of [...root.children]) {
      root.remove(child);

      if (child instanceof LineSegments) {
        child.geometry.dispose();
      } else if (child instanceof Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
  };

  const makeLabelSprite = (
    text: string,
    x: number,
    y: number,
    labelHeight: number,
  ) => {
    const label = createRulerLabelTexture(text);
    const spriteMaterial = new SpriteMaterial({
      map: label.texture,
      color: labelColor,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });
    const sprite = new Sprite(spriteMaterial);
    sprite.name = "Ground Plane Ruler Label";
    sprite.position.set(x, y, LABEL_Z);
    sprite.scale.set(labelHeight * label.aspect, labelHeight, 1);
    sprite.renderOrder = 2;
    sprite.raycast = () => undefined;

    return sprite;
  };

  const rebuild = (pixelsPerWorldUnit: number, step: number) => {
    disposeVisuals();

    const halfExtent = gridConfig.size / 2;
    const layout = computeGroundPlaneRulerLayout(halfExtent, step);
    const majorTickLength = MAJOR_TICK_PIXELS / pixelsPerWorldUnit;
    const minorTickLength = MINOR_TICK_PIXELS / pixelsPerWorldUnit;
    const labelOffset = LABEL_OFFSET_PIXELS / pixelsPerWorldUnit;
    const labelHeight = LABEL_PIXEL_HEIGHT / pixelsPerWorldUnit;

    const axisGeometry = new BufferGeometry();
    axisGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        [
          -halfExtent, 0, AXIS_Z, halfExtent, 0, AXIS_Z,
          0, -halfExtent, AXIS_Z, 0, halfExtent, AXIS_Z,
        ],
        3,
      ),
    );
    const axisLine = new LineSegments(axisGeometry, axisMaterial);
    axisLine.name = "Ground Plane Ruler Axes";
    axisLine.renderOrder = 1;
    axisLine.raycast = () => undefined;
    root.add(axisLine);

    const tickVertices: number[] = [];

    const addTick = (position: number, length: number) => {
      tickVertices.push(position, -length / 2, AXIS_Z);
      tickVertices.push(position, length / 2, AXIS_Z);
      tickVertices.push(-length / 2, position, AXIS_Z);
      tickVertices.push(length / 2, position, AXIS_Z);
    };

    for (const tick of layout.ticks) {
      addTick(tick.position, tick.major ? majorTickLength : minorTickLength);
    }

    const tickGeometry = new BufferGeometry();
    tickGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(tickVertices, 3),
    );
    const tickLines = new LineSegments(tickGeometry, tickMaterial);
    tickLines.name = "Ground Plane Ruler Ticks";
    tickLines.renderOrder = 1;
    tickLines.raycast = () => undefined;
    root.add(tickLines);

    for (const label of layout.labels) {
      const text = formatRulerLabel(label.value);

      if (label.position === 0) {
        root.add(
          makeLabelSprite(text, label.position, -labelOffset, labelHeight),
        );
      } else {
        root.add(
          makeLabelSprite(text, label.position, -labelOffset, labelHeight),
        );
        root.add(
          makeLabelSprite(text, -labelOffset, label.position, labelHeight),
        );
      }
    }
  };

  return {
    object: root,
    setGridConfig: (config) => {
      gridConfig = config;
      dirty = true;
      invalidate();
    },
    updateForCamera: () => {
      if (disposed) {
        return;
      }

      const viewportHeight =
        canvas.clientHeight > 0 ? canvas.clientHeight : 600;
      const pixelsPerWorldUnit = projectWorldLengthToPixels(
        camera,
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        1,
        viewportHeight,
      );

      if (pixelsPerWorldUnit === null) {
        return;
      }

      const { minStep, maxStep } = rulerStepBounds(gridConfig);
      const step = selectRulerLabelStep({
        pixelsPerWorldUnit,
        minStep,
        maxStep,
        currentStep,
      });

      if (step === null || (step === currentStep && !dirty)) {
        return;
      }

      currentStep = step;
      dirty = false;
      rebuild(pixelsPerWorldUnit, step);
    },
    setPalette: (palette) => {
      labelColor = deriveRulerLabelColor(palette);
      axisMaterial.color.set(palette.gridMajor);
      tickMaterial.color.set(palette.gridMinor);

      for (const child of root.children) {
        if (child instanceof Sprite) {
          child.material.color.set(labelColor);
        }
      }
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      disposeVisuals();
      axisMaterial.dispose();
      tickMaterial.dispose();
      root.removeFromParent();
    },
  };
}
