#pragma once

// 3MF export (ISO/IEC 25422 core spec) and an independent validator.
//
// The reference has no 3MF export; this is a native product requirement (STL
// stays the interchange format; 3MF adds units, several named objects in one
// file and a shared-vertex mesh). Coordinates are written unchanged:
// millimetres, Z-up, the same frame as the STL export, so a 3MF and an STL of
// the same body describe identical geometry.
//
// The package is a ZIP with three parts: [Content_Types].xml, _rels/.rels and
// 3D/3dmodel.model. Entries are STORED (not deflated): the writer needs no
// compression library, every reader accepts it, and CRC-32 still protects each
// entry. Output is deterministic (fixed timestamps, no random ids).

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

#include "contracts/Geometry.h"

namespace craft::threemf {

struct Object {
  std::string name;
  const MeshPayload* mesh = nullptr;  ///< not owned; must outlive encode()
};

/// Throws CodedError:
///   threemf_write_failed  no objects, an empty / out-of-range mesh, or the file could not be written
std::vector<std::uint8_t> encode(const std::vector<Object>& objects, const std::string& title = {});

/// Writes encode() atomically-enough for an export: to "<path>.part" then renamed, the partial file removed on failure.
void write(const std::filesystem::path& path, const std::vector<Object>& objects, const std::string& title = {});

struct ObjectReport {
  std::string name;
  std::size_t vertices = 0;
  std::size_t triangles = 0;
  bool indicesInRange = false;
  bool noDegenerateTriangles = false;
  bool closedTwoManifold = false;  ///< every directed edge appears once and its reverse once (consistent orientation)
  double volume = 0;               ///< signed volume in mm^3 (positive: outward winding)
  double bounds[6] = {0, 0, 0, 0, 0, 0};  ///< min xyz, max xyz
};

struct Report {
  bool ok = false;           ///< package structure and every per-object check passed
  std::string problem;       ///< first structural problem; empty when ok
  std::string unit;          ///< the model unit attribute
  std::size_t buildItems = 0;
  std::vector<ObjectReport> objects;
};

/// Reads a 3MF package back from its bytes without trusting the writer: ZIP directory and CRC-32 of every entry, the three
/// required parts, XML well-formedness of the model, unit, vertices/triangles, build items that reference real objects, and the
/// per-object mesh checks above. Never throws; problems are reported.
Report validate(const std::vector<std::uint8_t>& bytes);
Report validateFile(const std::filesystem::path& path);

}  // namespace craft::threemf
