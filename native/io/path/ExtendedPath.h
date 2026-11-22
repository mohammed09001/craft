#pragma once

// Paths of MAX_PATH (260) characters or more on Windows.
//
// Windows ships with long paths switched off (HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 0). Then the file API that
// std::filesystem and the C++ streams call refuses a path of 260 characters or more (248 for a folder), unless it is given in the
// extended-length form `\\?\C:\folder\file` (or `\\?\UNC\server\share\file`). Qt does that by itself for QFile, QSaveFile and QDir; the
// standard library does not. A deep folder is not exotic (a OneDrive or customer folder is often 150 to 200 characters, and the exports
// add a folder and a descriptive file name to it), so every place that opens, creates, renames or removes a file through the standard
// library gives its path through here first.
//
// The extended form turns Windows' own path normalisation off, so the path is made absolute, normalised and given backslashes first. It is
// only used for the file calls: paths shown to the user, stored in results or written into manifests stay in their ordinary form
// (`displayPath`). Elsewhere than Windows both functions return the path unchanged.

#include <cstddef>
#include <filesystem>

namespace craft::io {

/// `path` in the form the Windows file API accepts at any length, when it is, or with `reserve` more characters (a name that will be
/// appended, a temporary suffix) would be, near or over the limit; otherwise `path` unchanged. A path that already carries the prefix, an
/// empty path and a path that cannot be made absolute are returned unchanged.
std::filesystem::path extendedLength(const std::filesystem::path& path, std::size_t reserve = 0);

/// `path` without the extended-length prefix (`\\?\C:\x` -> `C:\x`, `\\?\UNC\s\x` -> `\\s\x`): what the user would recognise.
std::filesystem::path displayPath(const std::filesystem::path& path);

}  // namespace craft::io
