#include "SystemMemory.h"

#ifdef _WIN32
#include <windows.h>
#elif defined(__linux__)
#include <cstdio>
#endif

namespace craft::app {

std::uint64_t availablePhysicalMemoryBytes() {
#ifdef _WIN32
  MEMORYSTATUSEX status{};
  status.dwLength = sizeof status;
  return GlobalMemoryStatusEx(&status) ? static_cast<std::uint64_t>(status.ullAvailPhys) : 0;
#elif defined(__linux__)
  std::FILE* file = std::fopen("/proc/meminfo", "r");
  if (!file) return 0;
  char line[256];
  std::uint64_t kibibytes = 0;
  while (std::fgets(line, sizeof line, file)) {
    unsigned long long value = 0;
    if (std::sscanf(line, "MemAvailable: %llu kB", &value) == 1) {
      kibibytes = value;
      break;
    }
  }
  std::fclose(file);
  return kibibytes * 1024;
#else
  return 0;  // macOS and others: not implemented (the application is validated on Windows only)
#endif
}

}  // namespace craft::app
