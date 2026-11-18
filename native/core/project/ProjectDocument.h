#pragma once

// The Craft project document: everything a user decided, and nothing derived.
//
// A project stores INPUTS -- the source model, the mold settings, the sprue
// intents, the printer volume and segmentation plan inputs, the view -- and
// records which derived stages had been produced (`workflow`). Derived results
// (mold bodies, segmentation pieces, Master Mold sets, analysis reports) are
// not stored: the pipelines are deterministic, so opening a project rebuilds
// them from the stored inputs (and the tests check that the rebuilt volumes
// equal the originals). That keeps files small and avoids storing results that
// could silently disagree with their inputs.
//
// Units are millimeters and the coordinate system is Z-up, as everywhere in
// Craft; both are written into the file and checked on load.
//
// This file is the in-memory model only. The on-disk format (container,
// manifest JSON, integrity, versioning, migrations) lives in io/project. Qt-free.

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace craft::project {

/// File format version written by this build. Compatibility policy (see ProjectFile.h):
/// a different MAJOR is refused; a newer MINOR is read, unknown members are preserved.
inline constexpr int kFormatMajor = 1;
inline constexpr int kFormatMinor = 0;

struct Vec3 {
  double x = 0, y = 0, z = 0;
  friend bool operator==(const Vec3&, const Vec3&) = default;
};

/// How the source model is stored. "embedded": the project contains a canonical binary STL of the source triangles
/// (self-contained, portable). "linked": the project refers to a file outside it, verified by size and SHA-256.
struct ModelReference {
  std::string fileName;
  std::string storage = "embedded";  // embedded | linked
  std::string assetId;               // embedded: the asset holding the STL bytes
  std::string linkedPath;            // linked: the path last seen (may need relinking on another machine)
  std::uint64_t sizeBytes = 0;       // bytes of the embedded / linked STL
  std::string sha256;                // lowercase hex of those bytes
  std::uint64_t triangleCount = 0;   // informational
  std::string sourceEncoding;        // "ASCII" | "Binary": how the user's original file was encoded (informational)
  std::string geometryVersion;       // the app's geometry fingerprint of the grounded part when saved (checked on load)
  friend bool operator==(const ModelReference&, const ModelReference&) = default;
};

struct CutFaceInput {
  std::string face;                  // the reference's face id name
  bool enabled = false;
  std::optional<double> position;    // normalized; none = the face's own default
  friend bool operator==(const CutFaceInput&, const CutFaceInput&) = default;
};

struct MoldInputs {
  double moldClearanceMm = 0;
  double cavityClearanceMm = 0;
  std::vector<CutFaceInput> cutFaces;
  friend bool operator==(const MoldInputs&, const MoldInputs&) = default;
};

struct SprueScalarRecord {
  double valueMm = 0, unconstrainedValueMm = 0;
  std::string source;  // equation | minimum-limit | maximum-limit (the reference names)
  friend bool operator==(const SprueScalarRecord&, const SprueScalarRecord&) = default;
};

/// One sprue intent exactly as the user left it (position, direction, resolved profile).
struct SprueRecord {
  std::string operationId;
  int creationOrder = 0;
  Vec3 position, inwardDirection{0, 0, -1};
  double mainDiameterMm = 0, entryNeckDiameterMm = 0, entryNeckLengthMm = 0;
  std::string designSource = "fallback";  // geometry-derived | fallback
  std::optional<SprueScalarRecord> mainSection, entryNeck, entryNeckLength;
  std::vector<std::string> designWarnings;
  std::string validationStatus = "pending", validationReasonCode, validationMessage;
  friend bool operator==(const SprueRecord&, const SprueRecord&) = default;
};

struct SegmentationInputs {
  std::optional<Vec3> printerVolumeMm;
  /// User-added extension planes: axis ("x" | "y" | "z") and coordinate in mm.
  std::vector<std::pair<std::string, double>> extensions;
  friend bool operator==(const SegmentationInputs&, const SegmentationInputs&) = default;
};

struct CameraPose {
  Vec3 position, target;
  friend bool operator==(const CameraPose&, const CameraPose&) = default;
};

struct ViewState {
  std::string theme = "dark";
  bool showGrid = true, showAxes = true, showEdges = true;
  double moldOpacity = 0.55;
  std::optional<CameraPose> camera;  // presentation only: not part of the dirty check
};

/// Which derived stages existed when the project was saved. Opening rebuilds exactly these.
struct Workflow {
  bool segmentationPlanned = false;
  bool segmentationExecuted = false;
  bool moldGenerated = false;
  friend bool operator==(const Workflow&, const Workflow&) = default;
};

struct Document {
  std::string projectId;          // stable identity across saves (autosave files and recovery key on it)
  std::string createdAt;          // ISO-8601 UTC
  std::string modifiedAt;
  std::string appVersion;         // the build that last wrote the file
  std::optional<ModelReference> model;
  MoldInputs mold;
  std::vector<SprueRecord> sprues;
  int nextSprueNumber = 1;
  SegmentationInputs segmentation;
  ViewState view;
  Workflow workflow;
  /// Set only in autosave files (crash recovery): where the project was last saved, empty when it never was.
  std::optional<std::string> autosaveOriginalPath;
  /// Unknown top-level manifest members from a newer minor version, as compact JSON text, written back unchanged.
  std::string preservedExtensionsJson;
};

/// Structural validation of a document's values (finite numbers, known enums, consistent model reference).
/// Returns an empty string when valid, else the first problem.
std::string validateDocument(const Document& document);

/// The inputs-only fingerprint used for "unsaved changes": excludes ids, timestamps, app version, the camera and the
/// workflow flags (which stages were generated is derived state, not something the user edited).
std::string inputsFingerprint(const Document& document);

}  // namespace craft::project
