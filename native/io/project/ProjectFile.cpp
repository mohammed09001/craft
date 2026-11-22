#include "project/ProjectFile.h"

#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSaveFile>
#include <QtEndian>

#include <algorithm>

#include "project/ProjectJson.h"

namespace craft::project {

namespace {

constexpr char kMagic[8] = {'C', 'R', 'A', 'F', 'T', 'P', 'R', 'J'};
constexpr char kEndMagic[8] = {'C', 'R', 'A', 'F', 'T', 'E', 'N', 'D'};
constexpr qint64 kHeaderBytes = 64;
constexpr qint64 kFooterBytes = 48;
constexpr char kModelAssetId[] = "model";

struct Header {
  int major = 0, minor = 0;
  quint64 manifestOffset = 0, manifestLength = 0;
};

[[noreturn]] void fail(const char* code, const std::string& message) { throw ProjectIoError(code, message); }

void put16(QByteArray& b, qint64 at, quint16 v) { qToLittleEndian(v, b.data() + at); }
void put32(QByteArray& b, qint64 at, quint32 v) { qToLittleEndian(v, b.data() + at); }
void put64(QByteArray& b, qint64 at, quint64 v) { qToLittleEndian(v, b.data() + at); }

QByteArray encodeHeader(int major, int minor, quint64 manifestOffset, quint64 manifestLength) {
  QByteArray header(kHeaderBytes, '\0');
  std::copy(std::begin(kMagic), std::end(kMagic), header.data());
  put16(header, 8, static_cast<quint16>(major));
  put16(header, 10, static_cast<quint16>(minor));
  put32(header, 12, 0);
  put64(header, 16, manifestOffset);
  put64(header, 24, manifestLength);
  return header;
}

QByteArray sha256Raw(const QByteArray& bytes) { return QCryptographicHash::hash(bytes, QCryptographicHash::Sha256); }

void checkCancelled(const IoControl& control) {
  if (control.cancelled && control.cancelled()) fail("project_cancelled", "The operation was cancelled.");
}
void report(const IoControl& control, double fraction) {
  if (control.progress) control.progress(std::clamp(fraction, 0.0, 1.0));
}
qint64 chunkOf(const IoControl& control) { return static_cast<qint64>(std::max<std::size_t>(control.chunkBytes, 1)); }

/// SHA-256 of `bytes`, in chunks so that a long hash can report progress (spanning `from`..`to`) and be cancelled.
QByteArray sha256Chunked(const QByteArray& bytes, const IoControl& control, double from, double to) {
  QCryptographicHash hash(QCryptographicHash::Sha256);
  const qint64 chunk = chunkOf(control);
  for (qint64 at = 0; at < bytes.size(); at += chunk) {
    checkCancelled(control);
    const qint64 n = std::min(chunk, bytes.size() - at);
    hash.addData(QByteArrayView(bytes.constData() + at, n));
    report(control, from + (to - from) * static_cast<double>(at + n) / static_cast<double>(bytes.size()));
  }
  return hash.result();
}

/// Reads `size` bytes from the current position of `file` in chunks, hashing as it goes. `hash` receives the SHA-256 of what was read.
QByteArray readChunked(QFile& file, qint64 size, const IoControl& control, double from, double to, QByteArray& hash, const char* failure) {
  QByteArray data(size, Qt::Uninitialized);
  QCryptographicHash digest(QCryptographicHash::Sha256);
  const qint64 chunk = chunkOf(control);
  for (qint64 at = 0; at < size;) {
    checkCancelled(control);
    const qint64 n = file.read(data.data() + at, std::min(chunk, size - at));
    if (n <= 0) fail("project_unreadable", failure);
    digest.addData(QByteArrayView(data.constData() + at, n));
    at += n;
    report(control, from + (to - from) * static_cast<double>(at) / static_cast<double>(size));
  }
  hash = digest.result();
  return data;
}

struct Opened {
  QFile file;
  qint64 size = 0;
  Header header;
  QByteArray manifestBytes;
};

/// Opens `path` and verifies header, footer and manifest hash. Throws.
void openAndVerify(const QString& path, Opened& opened) {
  opened.file.setFileName(path);
  if (!QFileInfo::exists(path)) fail("project_not_found", "The project file does not exist: " + path.toStdString());
  if (!opened.file.open(QIODevice::ReadOnly)) fail("project_unreadable", "The project file could not be opened: " + opened.file.errorString().toStdString());
  opened.size = opened.file.size();
  if (opened.size < kHeaderBytes + kFooterBytes) {
    const QByteArray head = opened.file.read(8);
    if (head.size() == 8 && std::equal(head.begin(), head.end(), kMagic)) fail("project_truncated", "The project file is truncated (shorter than its header and footer).");
    fail("project_not_a_craft_file", "This is not a Craft project file.");
  }
  const QByteArray header = opened.file.read(kHeaderBytes);
  if (!std::equal(kMagic, kMagic + 8, header.constData())) fail("project_not_a_craft_file", "This is not a Craft project file.");
  opened.header.major = qFromLittleEndian<quint16>(header.constData() + 8);
  opened.header.minor = qFromLittleEndian<quint16>(header.constData() + 10);
  opened.header.manifestOffset = qFromLittleEndian<quint64>(header.constData() + 16);
  opened.header.manifestLength = qFromLittleEndian<quint64>(header.constData() + 24);

  opened.file.seek(opened.size - kFooterBytes);
  const QByteArray footer = opened.file.read(kFooterBytes);
  if (!std::equal(kEndMagic, kEndMagic + 8, footer.constData()))
    fail("project_truncated", "The project file is incomplete (its end marker is missing): it was probably cut off while being written or copied.");
  const quint64 recordedLength = qFromLittleEndian<quint64>(footer.constData() + 40);
  if (recordedLength != static_cast<quint64>(opened.size))
    fail("project_truncated", "The project file has the wrong length (" + std::to_string(opened.size) + " bytes, expected " + std::to_string(recordedLength) + ").");

  if (opened.header.manifestOffset < static_cast<quint64>(kHeaderBytes) ||
      opened.header.manifestOffset + opened.header.manifestLength > static_cast<quint64>(opened.size - kFooterBytes))
    fail("project_corrupt", "The project file's manifest position is invalid.");
  opened.file.seek(static_cast<qint64>(opened.header.manifestOffset));
  opened.manifestBytes = opened.file.read(static_cast<qint64>(opened.header.manifestLength));
  if (static_cast<quint64>(opened.manifestBytes.size()) != opened.header.manifestLength) fail("project_unreadable", "The project manifest could not be read.");
  if (sha256Raw(opened.manifestBytes) != footer.mid(8, 32)) fail("project_corrupt", "The project manifest failed its integrity check (SHA-256 mismatch); the file is damaged.");
}

QJsonObject parseManifestJson(const QByteArray& bytes) {
  QJsonParseError parseError;
  const QJsonDocument doc = QJsonDocument::fromJson(bytes, &parseError);
  if (parseError.error != QJsonParseError::NoError || !doc.isObject()) fail("project_invalid", "The project manifest is not valid JSON: " + parseError.errorString().toStdString());
  return doc.object();
}

}  // namespace

std::string sha256Hex(const QByteArray& bytes) { return QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex().toStdString(); }

const std::vector<MigrationStep>& builtinMigrations() {
  static const std::vector<MigrationStep> steps;  // format major 1 is the first; nothing to migrate from yet
  return steps;
}

bool isIntactProject(const QString& path) {
  try {
    inspectProject(path);
    return true;
  } catch (const ProjectIoError&) {
    return false;
  }
}

ProjectSummary inspectProject(const QString& path) {
  Opened opened;
  openAndVerify(path, opened);
  const QJsonObject manifest = parseManifestJson(opened.manifestBytes);
  ProjectSummary summary;
  summary.formatMajor = opened.header.major;
  summary.formatMinor = opened.header.minor;
  summary.projectId = manifest["projectId"].toString().toStdString();
  summary.modifiedAt = manifest["modifiedAt"].toString().toStdString();
  summary.appVersion = manifest["app"].toObject()["version"].toString().toStdString();
  summary.modelFileName = manifest["model"].toObject()["fileName"].toString().toStdString();
  if (manifest["autosave"].isObject()) summary.autosaveOriginalPath = manifest["autosave"].toObject()["originalPath"].toString().toStdString();
  return summary;
}

void writeProject(const QString& path, const Document& document, const QByteArray& modelBytes, const WriteOptions& options) {
  if (const std::string problem = validateDocument(document); !problem.empty()) fail("project_invalid", "The project cannot be saved: " + problem);
  const bool embedded = document.model && document.model->storage == "embedded";
  if (embedded) {
    if (modelBytes.isEmpty()) fail("project_invalid", "The project cannot be saved: the embedded model has no data.");
    const bool digestMatches = options.modelDigestIsFresh || sha256Chunked(modelBytes, options.control, 0.0, 0.2).toHex().toStdString() == document.model->sha256;
    if (!digestMatches || static_cast<std::uint64_t>(modelBytes.size()) != document.model->sizeBytes)
      fail("project_invalid", "The project cannot be saved: the embedded model data does not match its recorded size and hash.");
  }
  checkCancelled(options.control);
  const int major = options.overrideFormatMajor.value_or(kFormatMajor), minor = options.overrideFormatMinor.value_or(kFormatMinor);

  // Keep the previous good file as "<name>.bak" before replacing it (only when it verifies, so a bad file never
  // overwrites a good backup).
  if (options.keepBackup && QFileInfo::exists(path) && isIntactProject(path)) {
    const QString backup = path + QStringLiteral(".bak");
    QFile::remove(backup);
    if (!QFile::copy(path, backup)) fail("project_write_failed", "The previous project could not be backed up to " + backup.toStdString());
  }

  QSaveFile file(path);
  file.setDirectWriteFallback(false);  // never write straight into the real file
  QDir().mkpath(QFileInfo(path).absolutePath());
  if (!file.open(QIODevice::WriteOnly)) fail("project_write_failed", "The project file could not be created: " + file.errorString().toStdString());
  try {

  const auto write = [&](const QByteArray& bytes) {
    if (file.write(bytes) != bytes.size()) fail("project_write_failed", "Writing the project failed: " + file.errorString().toStdString());
  };
  // The model is the bulk of the file: written in chunks (spanning 0.2..0.95 of the progress) so that it can report and be cancelled.
  const auto writeChunked = [&](const QByteArray& bytes) {
    const qint64 chunk = chunkOf(options.control);
    for (qint64 at = 0; at < bytes.size();) {
      checkCancelled(options.control);
      const qint64 n = std::min(chunk, bytes.size() - at);
      if (file.write(bytes.constData() + at, n) != n) fail("project_write_failed", "Writing the project failed: " + file.errorString().toStdString());
      at += n;
      report(options.control, 0.2 + 0.75 * static_cast<double>(at) / static_cast<double>(bytes.size()));
    }
  };
  write(encodeHeader(major, minor, 0, 0));  // patched once the manifest position is known

  std::vector<AssetEntry> assets;
  if (embedded) {
    AssetEntry entry;
    entry.id = document.model->assetId.empty() ? kModelAssetId : document.model->assetId;
    entry.role = "model";
    entry.name = document.model->fileName;
    entry.mediaType = "model/stl";
    entry.offset = static_cast<std::uint64_t>(file.pos());
    entry.size = static_cast<std::uint64_t>(modelBytes.size());
    entry.sha256 = document.model->sha256;
    writeChunked(modelBytes);
    assets.push_back(entry);
  }

  Document stored = document;
  if (embedded && stored.model->assetId.empty()) stored.model->assetId = kModelAssetId;
  const QByteArray manifest = QJsonDocument(documentToManifest(stored, assets, major, minor)).toJson(QJsonDocument::Compact);
  const quint64 manifestOffset = static_cast<quint64>(file.pos());
  write(manifest);

  QByteArray footer(kFooterBytes, '\0');
  std::copy(std::begin(kEndMagic), std::end(kEndMagic), footer.data());
  const QByteArray hash = sha256Raw(manifest);
  std::copy(hash.begin(), hash.end(), footer.data() + 8);
  put64(footer, 40, manifestOffset + static_cast<quint64>(manifest.size()) + static_cast<quint64>(kFooterBytes));
  write(footer);

  if (!file.seek(0)) fail("project_write_failed", "Writing the project failed: " + file.errorString().toStdString());
  write(encodeHeader(major, minor, manifestOffset, static_cast<quint64>(manifest.size())));
  checkCancelled(options.control);  // the last point at which stopping leaves the target as it was: after the commit the new file is the file
  if (!file.commit()) fail("project_write_failed", "The project could not be saved: " + file.errorString().toStdString());
  report(options.control, 1.0);

  } catch (...) {
    file.cancelWriting();  // a failed or cancelled write never replaces the file and leaves no temporary file behind
    throw;
  }
}

ProjectBundle readProject(const QString& path, const ReadOptions& options) {
  checkCancelled(options.control);
  Opened opened;
  openAndVerify(path, opened);
  report(options.control, 0.02);
  ProjectBundle bundle;
  bundle.fileMajor = opened.header.major;
  bundle.fileMinor = opened.header.minor;

  if (opened.header.major > kFormatMajor)
    fail("project_unsupported_version", "This project was created by a newer version of Craft (file format " + std::to_string(opened.header.major) + "." +
                                            std::to_string(opened.header.minor) + "); this version reads format " + std::to_string(kFormatMajor) + ".x. Update Craft to open it.");

  QJsonObject manifest = parseManifestJson(opened.manifestBytes);
  const QJsonObject version = manifest["formatVersion"].toObject();
  if (version["major"].toInt(-1) != opened.header.major || version["minor"].toInt(-1) != opened.header.minor)
    fail("project_corrupt", "The project's header and manifest disagree about the file format version.");

  if (opened.header.major < kFormatMajor) {
    const std::vector<MigrationStep>& chain = options.migrations ? *options.migrations : builtinMigrations();
    int major = opened.header.major;
    while (major < kFormatMajor) {
      const auto step = std::find_if(chain.begin(), chain.end(), [&](const MigrationStep& s) { return s.fromMajor == major; });
      if (step == chain.end())
        fail("project_unsupported_version", "This project uses the older file format " + std::to_string(opened.header.major) + "." + std::to_string(opened.header.minor) +
                                                " and no migration to format " + std::to_string(kFormatMajor) + " is available.");
      try {
        step->apply(manifest);
      } catch (const std::exception& error) {
        fail("project_migration_failed", "Upgrading the project from format " + std::to_string(major) + " failed (" + step->description + "): " + error.what());
      }
      major = step->toMajor;
      manifest["formatVersion"] = QJsonObject{{"major", major}, {"minor", 0}};
      bundle.warnings.push_back("Upgraded from file format " + std::to_string(opened.header.major) + "." + std::to_string(opened.header.minor) + ": " + step->description);
    }
    bundle.migrated = true;
  } else if (opened.header.minor > kFormatMinor) {
    bundle.warnings.push_back("The project was saved by a newer Craft (file format " + std::to_string(opened.header.major) + "." + std::to_string(opened.header.minor) +
                              "); settings this version does not know are kept and written back unchanged.");
  }

  ManifestParse parsed = manifestToDocument(manifest);
  if (!parsed.error.empty()) fail("project_invalid", "The project is not valid: " + parsed.error);
  if (const std::string problem = validateDocument(parsed.document); !problem.empty()) fail("project_invalid", "The project is not valid: " + problem);

  if (parsed.document.model && parsed.document.model->storage == "embedded") {
    const auto asset = std::find_if(parsed.assets.begin(), parsed.assets.end(), [&](const AssetEntry& a) { return a.id == parsed.document.model->assetId; });
    if (asset == parsed.assets.end()) fail("project_invalid", "The project's model asset \"" + parsed.document.model->assetId + "\" is not in the file.");
    if (asset->offset < static_cast<quint64>(kHeaderBytes) || asset->offset + asset->size > opened.header.manifestOffset)
      fail("project_asset_corrupt", "The model data's position inside the project is invalid.");
    opened.file.seek(static_cast<qint64>(asset->offset));
    QByteArray digest;
    bundle.embeddedModelBytes = readChunked(opened.file, static_cast<qint64>(asset->size), options.control, 0.05, 1.0, digest, "The model data could not be read from the project.");
    if (digest.toHex().toStdString() != asset->sha256 || asset->sha256 != parsed.document.model->sha256)
      fail("project_asset_corrupt", "The model data failed its integrity check (SHA-256 mismatch); the project is damaged. If a backup (.bak) exists next to it, open that.");
  }
  bundle.document = std::move(parsed.document);
  report(options.control, 1.0);
  return bundle;
}

QByteArray loadLinkedModel(const ModelReference& model, const QString& pathOverride, const IoControl& control) {
  const QString path = pathOverride.isEmpty() ? QString::fromStdString(model.linkedPath) : pathOverride;
  QFile file(path);
  if (!QFileInfo::exists(path) || !file.open(QIODevice::ReadOnly)) fail("project_asset_missing", "The linked model file was not found: " + path.toStdString());
  if (static_cast<std::uint64_t>(file.size()) != model.sizeBytes)
    fail("project_asset_changed", "The linked model file has changed since the project was saved (size " + std::to_string(file.size()) + ", expected " + std::to_string(model.sizeBytes) + "): " + path.toStdString());
  QByteArray digest;
  const QByteArray bytes = readChunked(file, file.size(), control, 0.0, 1.0, digest, "The linked model file could not be read.");
  if (digest.toHex().toStdString() != model.sha256) fail("project_asset_changed", "The linked model file has changed since the project was saved (its content differs): " + path.toStdString());
  return bytes;
}

}  // namespace craft::project
