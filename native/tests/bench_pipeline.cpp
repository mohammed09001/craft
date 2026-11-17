// Pipeline benchmark (not a pass/fail test): times each CPU stage on
// generated spheres of increasing triangle count and prints a Markdown table.
// Run from a Release build; Debug numbers are not meaningful.

#include <chrono>
#include <cstdlib>
#include <cstdio>
#include <filesystem>

#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#endif

#include "ManifoldMeshEngine.h"
#include "MeshGeometryAdapter.h"
#include "TestMeshes.h"
#include "geometry/MeshAnalysis.h"
#include "model/ModelGrounding.h"
#include "mold/CavityGeneration.h"
#include "stl/Stl.h"

using namespace craft;
using Clock = std::chrono::steady_clock;

static double ms(Clock::time_point t) {
  return std::chrono::duration<double, std::milli>(Clock::now() - t).count();
}
static double peakMiB() {
#ifdef _WIN32
  PROCESS_MEMORY_COUNTERS c{};
  GetProcessMemoryInfo(GetCurrentProcess(), &c, sizeof(c));
  return c.PeakWorkingSetSize / (1024.0 * 1024.0);
#else
  return 0;
#endif
}

int main(int argc, char** argv) {
  const std::filesystem::path dir = argc > 1 ? argv[1] : std::filesystem::temp_directory_path();
  struct Size { int segments, rings; };
  const Size sizes[] = {{48, 24}, {160, 80}, {360, 180}, {700, 350}};
  const double cavityClearance = argc > 2 ? std::atof(argv[2]) : 0.0;  // 2nd arg: cavity clearance mm
  auto engine = createManifoldMeshEngine();

  std::printf("| triangles | STL MiB | read+validate ms | ground ms | render buffers ms | edge buffers ms | mold (1 split) ms | bodies | peak RSS MiB |\n");
  std::printf("|---|---|---|---|---|---|---|---|---|\n");
  for (const Size& s : sizes) {
    const MeshPayload sphere = test::sphereMesh({0, 0, 50}, 50, s.segments, s.rings);
    const auto path = dir / ("bench_" + std::to_string(sphere.triangleCount()) + ".stl");
    stl::writeBinary(path, sphere);
    const double mib = std::filesystem::file_size(path) / (1024.0 * 1024.0);

    auto t = Clock::now();
    const auto read = stl::readFile(path);
    const Bounds3 bounds = stl::validateDisplayable(read.soup);
    const double readMs = ms(t);

    t = Clock::now();
    const auto g = calculateModelGroundingTransform(bounds);
    auto grounded = std::make_shared<TriangleSoup>(read.soup);
    for (std::size_t i = 0; i + 2 < grounded->positions.size(); i += 3) {
      grounded->positions[i] += float(g->translation.x);
      grounded->positions[i + 1] += float(g->translation.y);
      grounded->positions[i + 2] += float(g->translation.z);
    }
    const double groundMs = ms(t);

    t = Clock::now();
    const auto buffers = viewport::buildTriangleBuffers(*grounded);
    const double bufMs = ms(t);
    t = Clock::now();
    const auto edges = viewport::buildFeatureEdgeBuffers(*grounded);
    const double edgeMs = ms(t);

    MoldGenerationRequest request;
    request.modelId = "bench";
    request.groundedPart = grounded;
    request.partGeometryVersion = partGeometryVersion(*grounded);
    request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
    request.cavityClearanceMm = cavityClearance;
    t = Clock::now();
    std::size_t bodies = 0;
    try {
      const auto result = generateMold(*engine, request);
      bodies = result.cavity.bodies.size();
      std::fprintf(stderr, "  [%zu tris] offset engine: %s\n", sphere.triangleCount(), result.cavity.selectedEngine.c_str());
    } catch (const CodedError& e) {
      std::fprintf(stderr, "mold failed: %s %s\n", e.code().c_str(), e.what());
    }
    const double moldMs = ms(t);

    std::printf("| %zu | %.1f | %.0f | %.0f | %.0f | %.0f | %.0f | %zu | %.0f |\n", sphere.triangleCount(),
                mib, readMs, groundMs, bufMs, edgeMs, moldMs, bodies, peakMiB());
    (void)buffers; (void)edges;
    std::filesystem::remove(path);
  }
}
