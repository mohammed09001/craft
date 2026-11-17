#include "ManifoldMeshEngine.h"

#include <cmath>
#include <utility>

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
