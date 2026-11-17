// Micro-benchmark of the signed-distance field (single thread), split into the
// closest-point query and the inside test. Not registered with CTest.
#include <chrono>
#include <cstdio>
#include <random>

#include "TestMeshes.h"
#include "geometry/SignedDistance.h"

using namespace craft;
using Clock = std::chrono::steady_clock;

int main() {
  const MeshPayload sphere = test::sphereMesh({0, 0, 50}, 50, 360, 180);
  SignedDistanceField field(sphere);
  std::mt19937_64 rng(1);
  std::uniform_real_distribution<double> u(-56, 56);
  std::vector<Point3> points;
  for (int i = 0; i < 20000; ++i) points.push_back({u(rng), u(rng), 50 + u(rng)});

  double sink = 0;
  auto t = Clock::now();
  for (const Point3& p : points) sink += field.distanceToSurface(p);
  const double closestUs = std::chrono::duration<double, std::micro>(Clock::now() - t).count() / points.size();

  std::size_t inside = 0;
  t = Clock::now();
  for (const Point3& p : points) inside += field.isInside(p);
  const double insideUs = std::chrono::duration<double, std::micro>(Clock::now() - t).count() / points.size();

  std::printf("triangles %zu: closest %.2f us/pt, inside %.2f us/pt (inside fraction %.2f) sink %g\n",
              field.triangleCount(), closestUs, insideUs, double(inside) / points.size(), sink);
}
