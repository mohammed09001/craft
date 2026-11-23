#pragma once

// Wire format of a mold generation job (P0-5 phase 3, docs/native-migration/PROCESS_ISOLATION_DESIGN.md): the request the application sends to the
// geometry worker process and the result it gets back. See wire/Wire.h for how the format is built and what it guarantees.

#include <cstdint>
#include <map>
#include <span>
#include <string>
#include <vector>

#include "mold/CavityGeneration.h"
#include "mold/DerivedMold.h"
#include "mold/SprueGeneration.h"
#include "wire/Wire.h"

namespace craft {

/// What the worker needs to generate a mold and evaluate its derived state. The sprue cache is shared with the application by pointer in-process;
/// across a process boundary its entries travel with the request, and the entries after the run travel back with the result.
struct MoldWorkerRequest {
  MoldGenerationRequest request;
  std::vector<SprueOperationDefinition> sprueIntents;
  std::map<std::string, SprueResultCache::Entry> sprueCache;
};

struct MoldWorkerResult {
  MoldGenerationResult mold;
  DerivedMoldEvaluation derived;
  std::map<std::string, SprueResultCache::Entry> sprueCache;
};

std::vector<std::uint8_t> encodeMoldWorkerRequest(const MoldWorkerRequest& request);
MoldWorkerRequest decodeMoldWorkerRequest(std::span<const std::uint8_t> bytes);

std::vector<std::uint8_t> encodeMoldWorkerResult(const MoldWorkerResult& result);
MoldWorkerResult decodeMoldWorkerResult(std::span<const std::uint8_t> bytes);

}  // namespace craft
