#pragma once

// Document <-> manifest JSON. The manifest is the human-inspectable heart of a
// .craft file (see ProjectFile.h for the container around it).

#include <QJsonObject>
#include <string>
#include <vector>

#include "project/ProjectDocument.h"

namespace craft::project {

/// One asset blob inside the container.
struct AssetEntry {
  std::string id, role, name, mediaType;
  std::uint64_t offset = 0, size = 0;
  std::string sha256;
};

inline constexpr const char* kSchema = "craft.project";

/// The manifest members this build understands; anything else is carried through as an extension.
const std::vector<std::string>& knownManifestMembers();

QJsonObject documentToManifest(const Document& document, const std::vector<AssetEntry>& assets, int formatMajor, int formatMinor);

struct ManifestParse {
  Document document;
  std::vector<AssetEntry> assets;
  int formatMajor = 0, formatMinor = 0;
  std::string error;  // empty on success
};
/// Strict parse of a (migrated) manifest. Unknown top-level members are kept in document.preservedExtensionsJson.
ManifestParse manifestToDocument(const QJsonObject& manifest);

}  // namespace craft::project
