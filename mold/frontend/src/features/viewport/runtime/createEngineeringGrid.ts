import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
} from "three";

import type { ViewportPalette } from "@/features/viewport/viewport.contracts";
import {
  DEFAULT_GRID_CONFIG,
  type AdaptiveGridConfig,
} from "@/features/viewport/runtime/adaptiveGrid";

export type EngineeringGrid = Group & {
  userData: {
    majorMaterial: LineBasicMaterial;
    minorMaterial: LineBasicMaterial;
  };
};

function createGridLines(size: number, step: number) {
  const halfSize = size / 2;
  const vertices: number[] = [];

  for (let value = -halfSize; value <= halfSize; value += step) {
    vertices.push(-halfSize, value, 0, halfSize, value, 0);
    vertices.push(value, -halfSize, 0, value, halfSize, 0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));

  return geometry;
}

export function createEngineeringGrid(
  palette: ViewportPalette,
  config: AdaptiveGridConfig = DEFAULT_GRID_CONFIG,
): EngineeringGrid {
  const grid = new Group() as EngineeringGrid;
  const minorMaterial = new LineBasicMaterial({
    color: palette.gridMinor,
    transparent: true,
    // The grid is orientation context, not the primary viewport subject.
    // Keep minor divisions quiet so imported parts and mold bodies retain
    // the strongest visual contrast.
    opacity: 0.32,
  });
  const majorMaterial = new LineBasicMaterial({
    color: palette.gridMajor,
    transparent: true,
    opacity: 0.50,
  });

  const minorLines = new LineSegments(
    createGridLines(config.size, config.minorStep),
    minorMaterial,
  );
  const majorLines = new LineSegments(
    createGridLines(config.size, config.majorStep),
    majorMaterial,
  );

  grid.userData.majorMaterial = majorMaterial;
  grid.userData.minorMaterial = minorMaterial;
  grid.add(minorLines, majorLines);

  return grid;
}

export function disposeEngineeringGrid(grid: EngineeringGrid) {
  grid.traverse((object) => {
    if (object instanceof LineSegments) {
      object.geometry.dispose();
    }
  });
  grid.userData.majorMaterial.dispose();
  grid.userData.minorMaterial.dispose();
}

export function updateEngineeringGridPalette(
  grid: EngineeringGrid,
  palette: ViewportPalette,
) {
  grid.userData.majorMaterial.color.set(palette.gridMajor);
  grid.userData.minorMaterial.color.set(palette.gridMinor);
}
