#pragma once

// Canonical geometry data contracts for the native Craft core.
//
// Conventions (carried over unchanged from the reference frontend, see
// mold/frontend/src/features/mold-generation/reference-mold-definition/
// referenceMoldDefinition.contracts.ts and cavityGeneration.contracts.ts):
//   - units are millimeters,
//   - the up axis is +Z, the build plate / mold bottom is the plane Z = 0,
//   - meshes are indexed triangle lists with counter-clockwise outward winding.
//
// Nothing in this header depends on Qt, the renderer, or a geometry kernel.

#include <array>
#include <cstdint>
#include <limits>
#include <string>
#include <vector>

namespace craft {

inline constexpr const char* kUnits = "millimeters";
inline constexpr const char* kUpAxis = "Z";

struct Point3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;

  double operator[](int axis) const { return axis == 0 ? x : axis == 1 ? y : z; }
  double& operator[](int axis) { return axis == 0 ? x : axis == 1 ? y : z; }
  friend bool operator==(const Point3&, const Point3&) = default;
};

struct Bounds3 {
  Point3 min;
  Point3 max;

  Point3 size() const { return {max.x - min.x, max.y - min.y, max.z - min.z}; }
  Point3 center() const {
    return {(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2};
  }
  friend bool operator==(const Bounds3&, const Bounds3&) = default;
};

/// Bounds that any real point will shrink: min = +inf, max = -inf.
inline Bounds3 emptyBounds() {
  const double inf = std::numeric_limits<double>::infinity();
  return {{inf, inf, inf}, {-inf, -inf, -inf}};
}

enum class Axis : int { X = 0, Y = 1, Z = 2 };

inline const char* axisName(Axis axis) {
  return axis == Axis::X ? "x" : axis == Axis::Y ? "y" : "z";
}

/// Mirrors MoldMeshFaceRun["role"] in orthogonalMold.ts.
enum class FaceRole { OuterMold, CavitySurface, RegistrationKey, SprueFunnel };

inline const char* faceRoleName(FaceRole role) {
  switch (role) {
    case FaceRole::OuterMold: return "outer-mold";
    case FaceRole::CavitySurface: return "cavity-surface";
    case FaceRole::RegistrationKey: return "registration-key";
    case FaceRole::SprueFunnel: return "sprue-funnel";
  }
  return "outer-mold";
}

struct MeshFaceRun {
  std::uint32_t startTriangle = 0;
  std::uint32_t triangleCount = 0;
  FaceRole role = FaceRole::OuterMold;
};

/// Mirrors MoldMeshPayload in orthogonalMold.ts: flat xyz positions plus
/// triangle vertex indices, with optional provenance runs.
struct MeshPayload {
  std::vector<double> positions;
  std::vector<std::uint32_t> indices;
  std::vector<MeshFaceRun> faceRuns;

  std::size_t vertexCount() const { return positions.size() / 3; }
  std::size_t triangleCount() const { return indices.size() / 3; }
  bool empty() const { return indices.empty(); }
};

/// Non-indexed triangles exactly as read from a mesh file: 9 floats per facet.
/// Float32 because that is the precision STL stores and the precision the
/// reference viewport and Boolean kernel operate at.
struct TriangleSoup {
  std::vector<float> positions;

  std::size_t triangleCount() const { return positions.size() / 9; }
  std::size_t vertexCount() const { return positions.size() / 3; }
};

/// Row-major 4x4 affine transform. Identity by default.
struct Transform {
  std::array<double, 16> m{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

  static Transform translation(double x, double y, double z) {
    Transform t;
    t.m[3] = x;
    t.m[7] = y;
    t.m[11] = z;
    return t;
  }
  Point3 apply(const Point3& p) const {
    return {m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
            m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
            m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11]};
  }
};

Bounds3 boundsOfPositions(const std::vector<double>& positions);
Bounds3 boundsOfSoup(const TriangleSoup& soup);
bool isFiniteBounds(const Bounds3& bounds);

/// Signed volume of an indexed closed mesh (positive for outward winding).
double signedVolume(const MeshPayload& mesh);

}  // namespace craft
