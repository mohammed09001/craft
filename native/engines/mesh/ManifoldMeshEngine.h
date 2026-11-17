#pragma once

#include <memory>

#include "IMeshGeometryEngine.h"

namespace craft {

/// IMeshGeometryEngine backed by native Manifold C++ (the same kernel revision
/// the reference frontend runs as WASM). Stateless and safe to use from a
/// worker thread; solids it returns are immutable.
std::unique_ptr<IMeshGeometryEngine> createManifoldMeshEngine();

}  // namespace craft
