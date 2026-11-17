#include "mold/DerivedMold.h"

namespace craft {

DerivedMoldEvaluation evaluateDerivedMold(IMeshGeometryEngine& engine, const MoldGenerationResult& mold,
                                          std::vector<SprueOperationDefinition> sprueDefinitions,
                                          const ProgressCallback& progress) {
  const auto report = [&](const char* stage, double fraction) {
    if (progress) progress(stage, fraction);
  };
  DerivedMoldEvaluation derived;

  std::vector<MoldBody> cavityBodies;
  for (const CavityMoldBody& b : mold.cavity.bodies) cavityBodies.push_back(b.body);

  report("sprues", 0);
  derived.sprues = evaluateSprues(engine, cavityBodies, mold.cavity.cavityTool.solid.mesh, mold.cavity.sourceSignature,
                                  mold.definition.definitionId + ":z-up", std::move(sprueDefinitions));
  report("sprues", 1);

  report("registration", 0);
  RegistrationDependencyInput input;
  input.bodies = derived.sprues.bodies;
  input.definitionId = mold.definition.definitionId;
  input.selectionBoxBounds = mold.definition.selectionBoxBounds;
  input.referenceBlockBounds = mold.definition.referenceMoldBlockBounds;
  input.referenceBlockClearanceMm = mold.definition.clearanceMm;
  input.cuttingPlanes = mold.cuttingPlanes;
  input.cavityMesh = &mold.cavity.cavityTool.solid.mesh;
  input.cavityBounds = mold.cavity.cavityTool.solid.bounds;
  input.cavityClearanceMm = mold.cavity.cavityTool.clearanceMm;
  input.cavityMethod = mold.cavity.cavityTool.implementationMethod;
  input.cavityRevision = mold.cavity.sourceSignature;
  input.sprues = derived.sprues.resolvedSprues;
  derived.registration = generateDerivedRegistration(engine, buildRegistrationDependencySnapshot(input));
  report("registration", 1);
  return derived;
}

}  // namespace craft
