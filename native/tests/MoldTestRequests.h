#pragma once

// A real mold worker request on a 20 mm cube (shared by the mold wire-format and worker tests): optionally split by a mid plane (two bodies, so the
// registration keys are planned) and with N sprues on the cavity roof.

#include <memory>

#include "TestMeshes.h"
#include "mold/CavityGeneration.h"
#include "mold/MoldWire.h"
#include "mold/SprueProfile.h"

namespace craft::testing {

inline MoldWorkerRequest cubeMoldWorkerRequest(bool split, int sprueCount) {
  MoldWorkerRequest job;
  MoldGenerationRequest& request = job.request;
  request.modelId = "1:cube.stl:1";
  auto soup = std::make_shared<TriangleSoup>(test::soupFromMesh(test::cubeMesh(test::box(-10, -10, 0, 10, 10, 20))));
  request.partGeometryVersion = "geometry-version-cube";
  request.groundedPart = std::move(soup);
  request.moldClearanceMm = 10;
  request.generationVersion = 1;
  if (split) request.cuttingPlanes = {createCuttingPlane(FaceId::Top, 0.5)};
  const SprueProfileDesignResult design = resolveSprueIntegration({8000, {20, 20, 20}, 10}).design;
  const double xs[] = {-6, 0, 6};
  for (int i = 0; i < sprueCount && i < 3; ++i) {
    SprueOperationDefinition d;
    d.operationId = "sprue:" + std::to_string(i);
    d.position = {xs[i], 0, 40};
    d.profileDesign = design;
    d.creationOrder = i;
    job.sprueIntents.push_back(d);
  }
  return job;
}

}  // namespace craft::testing
