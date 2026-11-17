#include "ManifoldMeshEngine.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <exception>
#include <mutex>
#include <thread>
#include <utility>
#include <vector>

#include <manifold/manifold.h>

#include "contracts/Operation.h"

namespace craft {

namespace {

const char* statusName(manifold::Manifold::Error error) {
  using E = manifold::Manifold::Error;
  switch (error) {
    case E::NoError: return "NoError";
    case E::NonFiniteVertex: return "NonFiniteVertex";
    case E::NotManifold: return "NotManifold";
    case E::VertexOutOfBounds: return "VertexOutOfBounds";
    case E::PropertiesWrongLength: return "PropertiesWrongLength";
    case E::MissingPositionProperties: return "MissingPositionProperties";
    case E::MergeVectorsDifferentLengths: return "MergeVectorsDifferentLengths";
    case E::MergeIndexOutOfBounds: return "MergeIndexOutOfBounds";
    case E::TransformWrongLength: return "TransformWrongLength";
    case E::RunIndexWrongLength: return "RunIndexWrongLength";
    case E::FaceIDWrongLength: return "FaceIDWrongLength";
    case E::InvalidConstruction: return "InvalidConstruction";
    case E::ResultTooLarge: return "ResultTooLarge";
    default: return "UnknownError";
  }
}

const char* statusCode(manifold::Manifold::Error error) {
  using E = manifold::Manifold::Error;
  switch (error) {
    case E::NotManifold: return "mesh_not_manifold";
    case E::NonFiniteVertex: return "mesh_non_finite";
    default: return "mesh_kernel_error";
  }
}

// Same wording as assertManifoldStatus() in geometry/manifold.ts.
void assertStatus(const manifold::Manifold& solid, const std::string& operation) {
  const auto status = solid.Status();
  if (status != manifold::Manifold::Error::NoError) {
    throw CodedError(statusCode(status), operation + " failed: " + statusName(status) + ".");
  }
}

// Manifold's LevelSet samples the SDF at every vertex of two interleaved
// lattices (integer and half-integer offsets) before it refines the surface.
// Those positions are fully determined by (bounds, edgeLength), so they can be
// evaluated up front on all cores. Positions are reproduced with exactly the
// arithmetic of Manifold's sdf.cpp and every lookup verifies bit-equality, so
// a hit returns precisely what the SDF would have returned; anything else
// (surface refinement probes, a lattice mismatch) falls through to the SDF.
class LatticeCache {
 public:
  LatticeCache(const Bounds3& bounds, double edgeLength) {
    const Point3 dim = bounds.size();
    for (int a = 0; a < 3; ++a) {
      origin_[a] = bounds.min[a];
      size_[a] = static_cast<int>(dim[a] / edgeLength + 1.0);
      spacing_[a] = dim[a] / static_cast<double>(size_[a] - 1);
    }
  }

  double position(int axis, int index, int w) const {
    return origin_[axis] + spacing_[axis] * (static_cast<double>(index) + (w == 1 ? 0.0 : -0.5));
  }
  // Valid indices per axis: w == 1 -> [0, size-1], w == 0 -> [0, size].
  int count(int axis, int w) const { return size_[axis] + (w == 1 ? 0 : 1); }
  std::size_t flat(int w, int x, int y, int z) const {
    return (static_cast<std::size_t>(x) * count(1, w) + y) * count(2, w) + z;
  }

  void prefill(const std::function<double(const Point3&)>& sdf) {
    for (int w = 0; w < 2; ++w) {
      values_[w].assign(static_cast<std::size_t>(count(0, w)) * count(1, w) * count(2, w), 0.0);
    }
    const unsigned threads = std::max(1u, std::min(std::thread::hardware_concurrency(), 16u));
    std::atomic<int> nextSlab{0};
    std::atomic<bool> abort{false};
    std::exception_ptr failure;
    std::mutex failureMutex;
    for (int w = 0; w < 2; ++w) {
      nextSlab = 0;
      const auto worker = [&] {
        try {
          for (;;) {
            const int x = nextSlab.fetch_add(1);
            if (x >= count(0, w) || abort.load(std::memory_order_relaxed)) return;
            for (int y = 0; y < count(1, w); ++y) {
              for (int z = 0; z < count(2, w); ++z) {
                values_[w][flat(w, x, y, z)] =
                    sdf({position(0, x, w), position(1, y, w), position(2, z, w)});
              }
            }
          }
        } catch (...) {
          abort = true;
          std::lock_guard<std::mutex> lock(failureMutex);
          if (!failure) failure = std::current_exception();
        }
      };
      std::vector<std::thread> pool;
      for (unsigned i = 1; i < threads; ++i) pool.emplace_back(worker);
      worker();
      for (std::thread& t : pool) t.join();
      if (failure) std::rethrow_exception(failure);
    }
    ready_ = true;
  }

  std::size_t hits() const { return hits_; }
  std::size_t misses() const { return misses_; }

  bool lookup(const Point3& p, double& value) const {
    const bool found = lookupImpl(p, value);
    ++(found ? hits_ : misses_);
    return found;
  }

 private:
  bool lookupImpl(const Point3& p, double& value) const {
    if (!ready_) return false;
    const double coordinates[3] = {p.x, p.y, p.z};
    int w = 1;
    int index[3];
    for (int a = 0; a < 3; ++a) {
      const double k = (coordinates[a] - origin_[a]) / spacing_[a];
      if (!std::isfinite(k)) return false;
      if (a == 0) {
        const double nearest = std::round(k);
        w = std::fabs(k - nearest) < 1e-6 ? 1 : 0;
      }
      index[a] = static_cast<int>(std::lround(w == 1 ? k : k + 0.5));
      if (index[a] < 0 || index[a] >= count(a, w)) return false;
      if (position(a, index[a], w) != coordinates[a]) return false;  // bit-exact or miss
    }
    value = values_[w][flat(w, index[0], index[1], index[2])];
    return true;
  }

 private:
  mutable std::size_t hits_ = 0, misses_ = 0;
  double origin_[3]{}, spacing_[3]{};
  int size_[3]{};
  std::vector<double> values_[2];
  bool ready_ = false;
};
class ManifoldSolid final : public ISolid {
 public:
  explicit ManifoldSolid(manifold::Manifold solid) : solid_(std::move(solid)) {}

  double volume() const override { return solid_.Volume(); }
  Bounds3 bounds() const override {
    const manifold::Box box = solid_.BoundingBox();
    return {{box.min.x, box.min.y, box.min.z}, {box.max.x, box.max.y, box.max.z}};
  }
  bool isEmpty() const override { return solid_.IsEmpty(); }
  bool isValid() const override {
    return solid_.Status() == manifold::Manifold::Error::NoError;
  }
  std::int64_t originalId() const override { return solid_.OriginalID(); }
  std::size_t triangleCount() const override { return solid_.NumTri(); }

  const manifold::Manifold& manifold() const { return solid_; }

 private:
  manifold::Manifold solid_;
};

const manifold::Manifold& unwrap(const SolidPtr& solid) {
  const auto* concrete = dynamic_cast<const ManifoldSolid*>(solid.get());
  if (concrete == nullptr) {
    throw CodedError("mesh_kernel_error", "Solid was not created by the Manifold engine.");
  }
  return concrete->manifold();
}

SolidPtr wrap(manifold::Manifold solid) {
  return std::make_shared<ManifoldSolid>(std::move(solid));
}

class ManifoldMeshEngine final : public IMeshGeometryEngine {
 public:
  std::string implementation() const override { return "manifold-cpp-3.5.1"; }

  SolidPtr solidFromMesh(const MeshPayload& mesh, double tolerance,
                         const std::string& operation) override {
    // Float32 MeshGL, exactly like manifoldFromPayload() feeds the WASM
    // kernel, so both kernels see identically quantized coordinates.
    manifold::MeshGL gl;
    gl.numProp = 3;
    gl.vertProperties.reserve(mesh.positions.size());
    for (double value : mesh.positions) gl.vertProperties.push_back(static_cast<float>(value));
    gl.triVerts.assign(mesh.indices.begin(), mesh.indices.end());
    gl.tolerance = static_cast<float>(tolerance);
    gl.Merge();
    manifold::Manifold solid(gl);
    assertStatus(solid, operation);
    return wrap(std::move(solid));
  }

  SolidPtr box(const Bounds3& bounds) override {
    const Point3 size = bounds.size();
    for (int axis = 0; axis < 3; ++axis) {
      if (!std::isfinite(size[axis]) || size[axis] <= 0) {
        throw CodedError("mesh_invalid_bounds", "Solid bounds are invalid.");
      }
    }
    return wrap(manifold::Manifold::Cube({size.x, size.y, size.z})
                    .Translate({bounds.min.x, bounds.min.y, bounds.min.z}));
  }

  SolidPtr asOriginal(const SolidPtr& solid) override { return wrap(unwrap(solid).AsOriginal()); }

  SolidPtr cylinder(double radius, double height, int segments, const Point3& axis,
                    const Point3& origin) override {
    const bool nearVertical = std::fabs(axis.z) >= 0.9;
    const double ref[3] = {0, nearVertical ? 1.0 : 0.0, nearVertical ? 0.0 : 1.0};
    double x[3] = {ref[1] * axis.z - ref[2] * axis.y, ref[2] * axis.x - ref[0] * axis.z,
                   ref[0] * axis.y - ref[1] * axis.x};
    const double xl = std::sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
    for (double& v : x) v /= xl;
    const double y[3] = {axis.y * x[2] - axis.z * x[1], axis.z * x[0] - axis.x * x[2],
                         axis.x * x[1] - axis.y * x[0]};
    const manifold::mat3x4 transform({x[0], x[1], x[2]}, {y[0], y[1], y[2]}, {axis.x, axis.y, axis.z},
                                     {origin.x, origin.y, origin.z});
    manifold::Manifold canonical = manifold::Manifold::Cylinder(height, radius, radius, segments, false);
    manifold::Manifold result = canonical.Transform(transform);
    assertStatus(result, "Sprue cylinder construction");
    return wrap(std::move(result));
  }

  std::pair<SolidPtr, SolidPtr> splitByPlane(const SolidPtr& solid, const Point3& normal,
                                             double originOffset) override {
    auto parts = unwrap(solid).SplitByPlane({normal.x, normal.y, normal.z}, originOffset);
    return {wrap(std::move(parts.first)), wrap(std::move(parts.second))};
  }

  SolidPtr unionOf(const std::vector<SolidPtr>& solids) override {
    std::vector<manifold::Manifold> parts;
    for (const SolidPtr& s : solids) parts.push_back(unwrap(s));
    return wrap(manifold::Manifold::BatchBoolean(parts, manifold::OpType::Add));
  }

  SolidPtr subtract(const SolidPtr& from, const SolidPtr& tool) override {
    return wrap(unwrap(from) - unwrap(tool));
  }

  SolidPtr intersect(const SolidPtr& a, const SolidPtr& b) override {
    return wrap(unwrap(a) ^ unwrap(b));
  }

  std::vector<SolidPtr> decompose(const SolidPtr& solid) override {
    std::vector<SolidPtr> parts;
    for (auto& part : unwrap(solid).Decompose()) parts.push_back(wrap(std::move(part)));
    return parts;
  }

  SolidPtr simplify(const SolidPtr& solid, double tolerance) override {
    return wrap(unwrap(solid).Simplify(tolerance));
  }

  SolidPtr minkowskiSphere(const SolidPtr& solid, double radius, int segments) override {
    const manifold::Manifold sphere = manifold::Manifold::Sphere(radius, segments);
    manifold::Manifold result = unwrap(solid).MinkowskiSum(sphere);
    assertStatus(result, "Cavity offset");
    return wrap(std::move(result));
  }

  SolidPtr levelSet(const std::function<double(const Point3&)>& sdf, const Bounds3& bounds,
                    double edgeLength, double level, double tolerance) override {
    const manifold::Box box({bounds.min.x, bounds.min.y, bounds.min.z},
                            {bounds.max.x, bounds.max.y, bounds.max.z});
    LatticeCache cache(bounds, edgeLength);
    const auto t0 = std::chrono::steady_clock::now();
    cache.prefill(sdf);
    if (std::getenv("CRAFT_TRACE_LEVELSET")) {
      std::fprintf(stderr, "levelSet prefill %.0f ms\n",
                   std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count());
    }
    manifold::Manifold result = manifold::Manifold::LevelSet(
        [&](manifold::vec3 p) {
          const Point3 point{p.x, p.y, p.z};
          double value = 0;
          return cache.lookup(point, value) ? value : sdf(point);
        },
        box, edgeLength, level, tolerance, /*canParallel=*/false);
    return wrap(std::move(result));
  }
  MeshPayload meshFromSolid(const SolidPtr& solid, const std::map<std::int64_t, FaceRole>& roles,
                            const std::string& operation) override {
    const manifold::Manifold& source = unwrap(solid);
    assertStatus(source, operation);
    const manifold::MeshGL gl = source.GetMeshGL();

    MeshPayload payload;
    const std::size_t vertexCount = gl.NumVert();
    payload.positions.reserve(vertexCount * 3);
    for (std::size_t vertex = 0; vertex < vertexCount; ++vertex) {
      const std::size_t offset = vertex * gl.numProp;
      payload.positions.push_back(gl.vertProperties[offset]);
      payload.positions.push_back(gl.vertProperties[offset + 1]);
      payload.positions.push_back(gl.vertProperties[offset + 2]);
    }
    payload.indices.assign(gl.triVerts.begin(), gl.triVerts.end());

    // runIndex has one more entry than runOriginalID (run boundaries).
    if (!gl.runOriginalID.empty() && gl.runIndex.size() == gl.runOriginalID.size() + 1) {
      for (std::size_t run = 0; run < gl.runOriginalID.size(); ++run) {
        const std::uint32_t startTriangle = gl.runIndex[run] / 3;
        const std::uint32_t endTriangle = gl.runIndex[run + 1] / 3;
        if (endTriangle <= startTriangle) continue;
        const auto role = roles.find(static_cast<std::int64_t>(gl.runOriginalID[run]));
        payload.faceRuns.push_back({startTriangle, endTriangle - startTriangle,
                                    role == roles.end() ? FaceRole::OuterMold : role->second});
      }
    }
    return payload;
  }
};

}  // namespace

std::unique_ptr<IMeshGeometryEngine> createManifoldMeshEngine() {
  return std::make_unique<ManifoldMeshEngine>();
}

}  // namespace craft
