#pragma once

// The .craft container: one file, atomic to write, verified on read.
//
//   offset 0     header, 64 bytes: "CRAFTPRJ", u16 major, u16 minor, u32 flags (0),
//                u64 manifestOffset, u64 manifestLength, 32 reserved zero bytes (little endian)
//   offset 64    asset blobs, back to back (v1: the embedded source-model STL)
//   manifestOff  manifest, UTF-8 JSON (ProjectJson.h): schema, versions, document, asset table
//   end - 48     footer: "CRAFTEND", SHA-256 of the manifest bytes (32), u64 total file length
//
// Integrity: the footer's length check catches truncation, the manifest hash catches
// manifest damage, and every asset carries a SHA-256 checked when it is read.
//
// Saving: written to a temporary file next to the target (QSaveFile) and renamed over
// it on commit, so a crash or a full disk never leaves a half-written project under
// the real name. The previous good file is kept as "<name>.bak" (one generation) when
// it passes the quick check, so a bad save can be undone.
//
// Versioning policy: the MAJOR version is the compatibility contract. A file with a
// newer major than this build is refused ("created by a newer Craft"); an older major
// is upgraded by the registered migration chain (the manifest JSON is migrated in
// memory, the file on disk is untouched until the next save, which writes the current
// version) and refused if a step is missing. A newer MINOR is read: members this build
// does not know are preserved and written back unchanged, with a warning.

#include <QByteArray>
#include <QString>
#include <functional>
#include <optional>
#include <cstddef>
#include <functional>
#include <stdexcept>
#include <string>
#include <vector>

#include "project/ProjectDocument.h"

class QJsonObject;

namespace craft::project {

/// Error codes (ProjectIoError::code()):
///   project_not_found, project_unreadable, project_not_a_craft_file, project_truncated, project_corrupt,
///   project_asset_corrupt, project_unsupported_version, project_invalid, project_migration_failed,
///   project_write_failed, project_asset_missing (linked model), project_asset_changed (linked model),
///   project_cancelled (the caller's IoControl asked to stop).
class ProjectIoError : public std::runtime_error {
 public:
  ProjectIoError(std::string code, const std::string& message) : std::runtime_error(message), code_(std::move(code)) {}
  const std::string& code() const { return code_; }

 private:
  std::string code_;
};

struct MigrationStep {
  int fromMajor = 0;
  int toMajor = 0;
  std::string description;
  std::function<void(QJsonObject& manifest)> apply;  // may throw; must leave a manifest the next step (or the reader) accepts
};
/// The migrations shipped with this build, ordered by fromMajor. Empty while the format is at its first major.
const std::vector<MigrationStep>& builtinMigrations();

/// Cooperative cancellation and progress for a long read or write; both parts are optional. `cancelled` is polled between chunks of about `chunkBytes` and
/// at the stage boundaries; `progress` receives 0..1 for the whole operation (never decreasing). A cancelled write leaves the target exactly as it was (the
/// temporary file is discarded), a cancelled read returns nothing; both throw ProjectIoError("project_cancelled"). Calls come from the calling thread.
struct IoControl {
  std::function<bool()> cancelled;
  std::function<void(double)> progress;
  std::size_t chunkBytes = 1u << 20;
};

struct WriteOptions {
  bool keepBackup = true;
  /// The caller has just computed document.model->sha256 from these very bytes (the application does, while encoding the model), so the
  /// writer does not hash them a second time (3 s for a 512 MiB model). The size is still checked, and a file whose model does not match
  /// its recorded hash is refused when it is opened. Off by default: a caller that took the hash from somewhere else gets the check.
  bool modelDigestIsFresh = false;
  IoControl control;
  /// Test hooks (also how files for older readers could be produced): write another format version.
  std::optional<int> overrideFormatMajor, overrideFormatMinor;
};

/// Writes `document` (+ the embedded model bytes, required when document.model is embedded) atomically.
/// The document is validated first; throws ProjectIoError.
void writeProject(const QString& path, const Document& document, const QByteArray& embeddedModelBytes, const WriteOptions& options = {});

struct ReadOptions {
  /// Replaces builtinMigrations() (tests inject a chain; production passes nothing).
  const std::vector<MigrationStep>* migrations = nullptr;
  IoControl control;
};

struct ProjectBundle {
  Document document;
  QByteArray embeddedModelBytes;  // empty for projects without a model or with a linked one
  std::vector<std::string> warnings;
  int fileMajor = 0, fileMinor = 0;  // as written in the file (before any migration)
  bool migrated = false;
};
/// Reads and fully verifies a project (including the embedded model's hash). Throws ProjectIoError.
ProjectBundle readProject(const QString& path, const ReadOptions& options = {});

struct ProjectSummary {
  std::string projectId, modifiedAt, appVersion, modelFileName;
  std::optional<std::string> autosaveOriginalPath;  // present only in autosave files
  int formatMajor = 0, formatMinor = 0;
};
/// Header + footer + manifest verification only (no asset reads): cheap enough for recovery prompts and backups.
ProjectSummary inspectProject(const QString& path);
/// True when inspectProject() would succeed.
bool isIntactProject(const QString& path);

/// Loads the bytes of a linked model and verifies size and SHA-256. `pathOverride` relinks to another location.
/// Throws project_asset_missing (no such file) or project_asset_changed (size/hash differ from the project's record).
QByteArray loadLinkedModel(const ModelReference& model, const QString& pathOverride = {}, const IoControl& control = {});

/// Lowercase hex SHA-256.
std::string sha256Hex(const QByteArray& bytes);

}  // namespace craft::project
