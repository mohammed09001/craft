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
ReadResult parse(std::span<const std::uint8_t> bytes);
ReadResult readFile(const std::filesystem::path& path,
                    std::uintmax_t maxFileBytes = kNativeMaxFileBytes);

/// Port of validateGeometry(): throws stl_invalid_geometry with the reference
/// message when the soup is not displayable; returns its bounds otherwise.
Bounds3 validateDisplayable(const TriangleSoup& soup);

/// The same bytes writeBinary would write, for a triangle soup (positions are written exactly: float32 in, float32 out,
/// so parse(encodeBinary(soup)) reproduces the soup). Throws stl_write_failed for an empty soup.
std::vector<std::uint8_t> encodeBinary(const TriangleSoup& soup, const std::string& headerNote = {});

/// Binary STL with facet normals computed from winding. Coordinates are
/// written unchanged (millimeters, Z-up). Throws stl_write_failed.
void writeBinary(const std::filesystem::path& path, const MeshPayload& mesh,
                 const std::string& headerNote = {});

}  // namespace craft::stl
