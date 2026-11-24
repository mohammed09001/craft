#pragma once

// STL import (ASCII + binary) and binary STL export.
//
// Behavioural reference: mold/frontend/src/features/viewport/
// modelImportValidation.ts (file policy) and runtime/localStlImport.ts
// (validateGeometry + the user-facing error messages, reproduced verbatim).
// Format detection follows three.js STLLoader: a file whose size matches the
// binary facet count is binary; otherwise a leading "solid" means ASCII.
//
// STL carries no unit information. Craft's established policy is to treat the
// numbers as millimeters and say so; nothing here rescales geometry.

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <span>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft::stl {

/// The browser reference caps local STL files at 25 MiB, a browser-memory
/// constraint. The native limit is higher (documented deviation D-004).
inline constexpr std::uintmax_t kReferenceMaxFileBytes = 25ull * 1024 * 1024;
inline constexpr std::uintmax_t kNativeMaxFileBytes = 512ull * 1024 * 1024;

enum class Encoding { Ascii, Binary };

struct ReadResult {
  TriangleSoup soup;
  Encoding encoding = Encoding::Binary;
  std::size_t facetCount = 0;
};

/// Error codes thrown as craft::CodedError:
///   stl_invalid_selection  wrong extension / empty / too large
///   stl_unreadable         the file could not be opened or read
///   stl_parse_failed       malformed ASCII or truncated binary data
///   stl_invalid_geometry   no vertices, non-finite values, or no size
///   stl_cancelled          readFileBytes was asked to stop
ReadResult parse(std::span<const std::uint8_t> bytes);
ReadResult readFile(const std::filesystem::path& path,
                    std::uintmax_t maxFileBytes = kNativeMaxFileBytes);

/// The file's bytes with readFile's checks (extension, empty, too large, unreadable), read in chunks of `chunkBytes` so that a long read can report
/// progress (0..1) and be stopped: `cancelled` (optional) is polled between chunks and throws CodedError("stl_cancelled") when it returns true.
/// readFile is this followed by parse().
std::vector<std::uint8_t> readFileBytes(const std::filesystem::path& path, std::uintmax_t maxFileBytes = kNativeMaxFileBytes,
                                        const std::function<bool()>& cancelled = {}, const std::function<void(double)>& progress = {},
                                        std::size_t chunkBytes = std::size_t{1} << 20);

/// Port of validateGeometry(): throws stl_invalid_geometry with the reference
/// message when the soup is not displayable; returns its bounds otherwise.
Bounds3 validateDisplayable(const TriangleSoup& soup);

/// The same bytes writeBinary would write, for a triangle soup (positions are written exactly: float32 in, float32 out,
/// so parse(encodeBinary(soup)) reproduces the soup). Throws stl_write_failed for an empty soup.
std::vector<std::uint8_t> encodeBinary(const TriangleSoup& soup, const std::string& headerNote = {});

/// The exact bytes writeBinary writes for an indexed mesh (callers that hash or verify the file use this).
/// Throws stl_write_failed for an empty mesh.
std::vector<std::uint8_t> encodeBinary(const MeshPayload& mesh, const std::string& headerNote = {});

/// Binary STL with facet normals computed from winding. Coordinates are
/// written unchanged (millimeters, Z-up). Throws stl_write_failed.
void writeBinary(const std::filesystem::path& path, const MeshPayload& mesh,
                 const std::string& headerNote = {});

}  // namespace craft::stl
