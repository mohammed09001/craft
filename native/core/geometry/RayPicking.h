#pragma once

// Ray/triangle picking against canonical geometry (not renderer buffers), so
// selection and measurement are testable without a GPU. The reference
// viewport raycasts the Three.js mesh (modelFacePicking.ts /
// pointerSelection.ts); the native equivalent intersects the same triangles.

#include <optional>

#include "contracts/Geometry.h"
#include "view/ViewPose.h"

namespace craft {

struct PickHit {
  std::size_t triangleIndex = 0;
  double distance = 0;  // along the ray, in millimeters
  Vec3 point;
  Vec3 normal;          // geometric (winding) normal, unit length
};

/// Nearest front- or back-facing hit; nullopt when the ray misses.
std::optional<PickHit> pickTriangleSoup(const TriangleSoup& soup, const Ray& ray);
std::optional<PickHit> pickMesh(const MeshPayload& mesh, const Ray& ray);

}  // namespace craft
