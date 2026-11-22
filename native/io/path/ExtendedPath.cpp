#include "path/ExtendedPath.h"

#include <string>
#include <system_error>

namespace craft::io {

namespace {

// CreateDirectory refuses a path of 248 characters or more; other calls accept up to MAX_PATH - 1 = 259. The folder limit is the stricter.
constexpr std::size_t kLimit = 248;

}  // namespace

#ifdef _WIN32

std::filesystem::path extendedLength(const std::filesystem::path& path, std::size_t reserve) {
  if (path.empty()) return path;
  const std::wstring& original = path.native();
  if (original.rfind(L"\\\\?\\", 0) == 0 || original.rfind(L"\\\\.\\", 0) == 0) return path;   // already extended, or a device path

  std::error_code error;
  std::filesystem::path absolute = std::filesystem::absolute(path, error);
  if (error) return path;
  absolute = absolute.lexically_normal();
  absolute.make_preferred();
  const std::wstring& text = absolute.native();
  if (text.size() + reserve < kLimit) return path;   // short enough, with what will be added: leave it exactly as given

  if (text.rfind(L"\\\\", 0) == 0) return std::filesystem::path(L"\\\\?\\UNC\\" + text.substr(2));   // \\server\share\x
  if (text.size() >= 2 && text[1] == L':') return std::filesystem::path(L"\\\\?\\" + text);          // C:\x
  return path;   // a root-relative path without a drive: not something the prefix can express
}

std::filesystem::path displayPath(const std::filesystem::path& path) {
  const std::wstring& text = path.native();
  if (text.rfind(L"\\\\?\\UNC\\", 0) == 0) return std::filesystem::path(L"\\\\" + text.substr(8));
  if (text.rfind(L"\\\\?\\", 0) == 0) return std::filesystem::path(text.substr(4));
  return path;
}

#else

std::filesystem::path extendedLength(const std::filesystem::path& path, std::size_t) { return path; }
std::filesystem::path displayPath(const std::filesystem::path& path) { return path; }

#endif

}  // namespace craft::io
