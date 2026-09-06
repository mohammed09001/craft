import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  type Material,
} from "three";

import type { MoldAppearanceMode } from "@/features/mold-generation/reference-mold-definition/moldAppearance.store";
import type { MoldBodyData } from "@/features/mold-generation/reference-mold-definition/orthogonalMold";
import { createMoldAppearanceMaterial } from "@/features/viewport/runtime/moldAppearance.material";
import type { CadGeometryRole } from "@/features/viewport/runtime/cadMaterialFactory";
import type { ViewportPalette } from "@/features/viewport/viewport.contracts";

export function resolveBodyRole(body: {
  readonly role?: string;
  readonly cavityAffected?: boolean;
}): CadGeometryRole {
  if (body.role === "registration-key" || body.role === "alignment-lock") {
    return "registration-key";
  }
  if (
    body.role === "sprue" ||
    body.role === "funnel" ||
    body.role === "sprue-funnel"
  ) {
    return "sprue-funnel";
  }
  if (body.role === "cavity-surface") return "cavity-surface";
  if (body.role === "imported-part") return "imported-part";
  return "outer-mold";
}

function disposeMaterial(material: Material | Material[]): void {
  (Array.isArray(material) ? material : [material]).forEach((entry) =>
    entry.dispose(),
  );
}

export function applyMoldBodyMeshAppearance(
  mesh: Mesh,
  mode: MoldAppearanceMode,
  palette?: ViewportPalette,
): void {
  const roles = mesh.userData.materialRoles as CadGeometryRole[] | undefined;
  if (roles === undefined || roles.length === 0) return;
  const materials = roles.map((role) =>
    createMoldAppearanceMaterial(mode, role, palette),
  );
  disposeMaterial(mesh.material);
  mesh.material = materials.length === 1 ? materials[0]! : materials;
  const opaque = mode === "solid";
  mesh.castShadow = opaque;
  mesh.receiveShadow = opaque;
}

export function createMoldBodyMesh(input: {
  readonly body: MoldBodyData;
  readonly mode: MoldAppearanceMode;
  readonly palette?: ViewportPalette | undefined;
}): Mesh {
  const { body } = input;
  let geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(body.mesh.positions), 3),
  );
  geometry.setIndex([...body.mesh.indices]);
  if (!body.mesh.faceRuns?.length) geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const roles: CadGeometryRole[] = [];
  if (body.mesh.faceRuns?.length) {
    for (const [index, run] of body.mesh.faceRuns.entries()) {
      geometry.addGroup(run.startTriangle * 3, run.triangleCount * 3, index);
      roles.push(run.role);
    }
  } else {
    roles.push(resolveBodyRole(body as { role?: string; cavityAffected?: boolean }));
  }

  const mesh = new Mesh(geometry);
  mesh.name = body.name;
  mesh.visible = body.visible;
  mesh.userData.moldBodyId = body.id;
  mesh.userData.materialRoles = roles;
  applyMoldBodyMeshAppearance(mesh, input.mode, input.palette);
  return mesh;
}
