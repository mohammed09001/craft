#pragma once

// Binary wire format for a Master Mold request and result, so that a job can run in another process (P0-5 phase 2,
// docs/native-migration/PROCESS_ISOLATION_DESIGN.md).
//
// Both directions of every type are one function (`visit` in MasterWire.cpp) driven by a writer or a reader, so a field cannot be written
// and forgotten when reading. A reader refuses truncated or oversized data with WireError instead of allocating what a corrupt length
// asks for. The format is not a file format: it is only ever read by the same build that wrote it (the same executable in worker mode), so it
// carries a magic and a kind tag and nothing else, and it is not versioned.

#include <cstdint>
#include <span>
#include <stdexcept>
#include <vector>

#include "master/MasterMoldStore.h"
#include "wire/Wire.h"

namespace craft {

std::vector<std::uint8_t> encodeMasterMoldRequest(const MasterMoldRequest& request);
MasterMoldRequest decodeMasterMoldRequest(std::span<const std::uint8_t> bytes);

std::vector<std::uint8_t> encodeMasterMoldResult(const MasterMoldResult& result);
MasterMoldResult decodeMasterMoldResult(std::span<const std::uint8_t> bytes);

}  // namespace craft
