#pragma once

// Narrow seam between Craft's mold algorithms and a solid/Boolean kernel.
//
// The reference frontend funnels every Boolean through
// mold-generation/geometry/manifold.ts; this interface is its native
// counterpart. Domain code (native/core/mold) depends only on this header, so
// the kernel can be replaced or mocked without touching mold logic, and no
// kernel type ever reaches the UI or the renderer.

#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft {

/// Opaque immutable solid owned by the engine that created it.
class ISolid {
 public:
  virtual ~ISolid() = default;
  virtual double volume() const = 0;
  virtual Bounds3 bounds() const = 0;
  virtual bool isEmpty() const = 0;
  /// False when the kernel reports an error status for this solid (a failed
  /// Boolean yields an invalid solid rather than throwing).
  virtual bool isValid() const = 0;
  /// Provenance id assigned by IMeshGeometryEngine::asOriginal, or -1.
  virtual std::int64_t originalId() const = 0;
  virtual std::size_t triangleCount() const = 0;
};

using SolidPtr = std::shared_ptr<const ISolid>;

class IMeshGeometryEngine {
 public:
  virtual ~IMeshGeometryEngine() = default;

  /// Stable implementation label recorded in results (e.g. "manifold-cpp-3.5.1").
  virtual std::string implementation() const = 0;

  /// Welds within `tolerance` and builds a solid. Throws craft::CodedError
  /// ("mesh_not_manifold" etc.) when the mesh is not a valid closed solid.
  virtual SolidPtr solidFromMesh(const MeshPayload& mesh, double tolerance,
                                 const std::string& operation) = 0;
  virtual SolidPtr box(const Bounds3& bounds) = 0;

  /// Tags a solid so faces it contributes to later results can be identified.
  virtual SolidPtr asOriginal(const SolidPtr& solid) = 0;

  /// Right circular cylinder of `radius` and `height` with `segments` sides.
  /// Its base disc centre is `origin` and its axis is the unit vector `axis`;
  /// the cross-section frame follows the reference sprue construction
  /// (x = normalize(cross(reference, axis)), reference = +Z, or +Y when the
  /// axis is near vertical).
  virtual SolidPtr cylinder(double radius, double height, int segments, const Point3& axis,
                            const Point3& origin) = 0;
  virtual SolidPtr unionOf(const std::vector<SolidPtr>& solids) = 0;

  virtual SolidPtr subtract(const SolidPtr& from, const SolidPtr& tool) = 0;
  virtual SolidPtr intersect(const SolidPtr& a, const SolidPtr& b) = 0;
  virtual std::vector<SolidPtr> decompose(const SolidPtr& solid) = 0;

  /// Kernel simplification within `tolerance` millimeters.
  virtual SolidPtr simplify(const SolidPtr& solid, double tolerance) = 0;
  /// Minkowski sum of `solid` with a sphere of `radius` (an outward offset
  /// with `segments` circular segments). Throws CodedError on kernel failure.
  virtual SolidPtr minkowskiSphere(const SolidPtr& solid, double radius, int segments) = 0;
  /// Marching-tetrahedra level set of `sdf` over `bounds`. The surface is
  /// where sdf == level, with sdf >= level kept as material (Manifold
  /// convention). `sdf` MUST be safe to call concurrently: the engine
  /// evaluates the sampling lattice on all cores. It may throw to abort (the
  /// first exception is rethrown to the caller). Throws CodedError on kernel
  /// failure.
  virtual SolidPtr levelSet(const std::function<double(const Point3&)>& sdf, const Bounds3& bounds,
                            double edgeLength, double level, double tolerance) = 0;

  /// Exports an indexed mesh. Faces whose provenance id appears in `roles`
  /// get that role; every other face run is FaceRole::OuterMold.
  virtual MeshPayload meshFromSolid(const SolidPtr& solid,
                                    const std::map<std::int64_t, FaceRole>& roles,
                                    const std::string& operation) = 0;
};

}  // namespace craft
