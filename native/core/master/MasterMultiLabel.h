#pragma once

// Master Mold multi-label partition: the joint voxel labeling (Besag's ICM over
// a Potts field) the engine uses as a last-resort working-mold construction.
// Ports of planning/multiLabelReconstruction.ts, multiLabelEscapeCorridor.ts
// and the shape-agnostic path of multiLabelPartition.ts (the opt-in convexity
// bias is not used by the engine and is not ported).

#include <cstdint>
#include <vector>

#include "IMeshGeometryEngine.h"
#include "contracts/Operation.h"

namespace craft {

struct RelaxLabelingResult {
  std::vector<std::int32_t> labels;
  int iterationsRun = 0;
  bool converged = false;
};

/// ICM relaxation: `dataCost[voxel * labelCount + label]`, 6-connected neighbours, Gauss-Seidel updates in raster order.
RelaxLabelingResult relaxLabeling(const std::array<int, 3>& dims, int labelCount, const std::vector<double>& dataCost,
                                  const std::vector<std::int32_t>& initialLabels, double smoothnessWeight, int maxIterations);
std::vector<std::int32_t> argminLabels(const std::vector<double>& dataCost, std::size_t voxelCount, int labelCount);

struct EscapeCorridorResult {
  std::vector<std::int32_t> labels;
  int corridorsCarved = 0;
  int totalCorridorVoxels = 0;
  std::vector<int> genuinelyUnreachablePieceLabels;
};
EscapeCorridorResult carveEscapeCorridors(const std::vector<std::int32_t>& labels, const std::array<int, 3>& dims,
                                          const std::vector<std::uint8_t>& isCavity, int labelCount);

struct MultiLabelPartitionInput {
  std::vector<std::vector<int>> pieceTriangleIndices;
  const std::vector<float>* positions = nullptr;
  const std::vector<std::uint32_t>* indices = nullptr;
  Bounds3 bounds;
  double voxelSizeMm = 1;
  double smoothnessWeight = 1;
  int maxIterations = 15;
};

struct MultiLabelPartitionResult {
  std::vector<SolidPtr> solids;
  std::array<int, 3> dims{};
  int iterationsRun = 0;
  bool converged = false;
  int corridorsCarved = 0;
  int totalCorridorVoxels = 0;
  std::vector<int> genuinelyUnreachablePieceLabels;
};

/// Throws std::runtime_error with the reference text on invalid input and CodedError("cancelled") when `cancel` is set.
MultiLabelPartitionResult buildMultiLabelPartitionSolids(IMeshGeometryEngine& engine, const MultiLabelPartitionInput& input,
                                                         const CancellationToken& cancel = {});

}  // namespace craft
