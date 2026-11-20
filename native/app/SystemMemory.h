#pragma once

// What the operating system says about memory, for refusing work that cannot fit (see estimateMoldPeakBytes).

#include <cstdint>

namespace craft::app {

/// Physical memory that is free right now (Windows: ullAvailPhys, which counts the standby cache as available; Linux: MemAvailable). 0 when it
/// cannot be determined (any other platform): callers treat 0 as "unknown" and do not refuse anything.
std::uint64_t availablePhysicalMemoryBytes();

}  // namespace craft::app
