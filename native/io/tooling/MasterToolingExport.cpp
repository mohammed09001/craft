#include "tooling/MasterToolingExport.h"

#include <QByteArray>
#include <QCryptographicHash>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>
#include <cctype>
#include <fstream>
#include <optional>
#include <set>
#include <system_error>

#include "stl/Stl.h"
#include "threemf/ThreeMf.h"

namespace craft::toolingexport {

namespace fs = std::filesystem;

namespace {

fs::path pathFromUtf8(const std::string& text) {
  return fs::path(std::u8string(reinterpret_cast<const char8_t*>(text.data()), text.size()));
}

std::string toLowerAscii(std::string text) {
  for (char& c : text) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return text;
}

std::string stemOf(const std::string& modelName) {
  std::string name = modelName;
  const std::size_t slash = name.find_last_of("/\\");
  if (slash != std::string::npos) name.erase(0, slash + 1);
  const std::size_t dot = name.find_last_of('.');
  if (dot != std::string::npos && dot > 0) name.erase(dot);
  return name;
}

std::string sha256Of(const std::uint8_t* data, std::size_t size) {
  return QCryptographicHash::hash(QByteArrayView(reinterpret_cast<const char*>(data), static_cast<qsizetype>(size)),
                                  QCryptographicHash::Sha256)
      .toHex()
      .toStdString();
}

QJsonArray pointArray(const Point3& p) { return QJsonArray{p.x, p.y, p.z}; }

QJsonObject boundsObject(const Bounds3& b) { return QJsonObject{{"min", pointArray(b.min)}, {"max", pointArray(b.max)}}; }

QJsonArray stringArray(const std::vector<std::string>& values) {
  QJsonArray array;
  for (const std::string& v : values) array.append(QString::fromStdString(v));
  return array;
}

QString q(const std::string& s) { return QString::fromStdString(s); }

[[noreturn]] void writeFailed(const std::string& what) { throw CodedError("master_export_write_failed", what); }

}  // namespace

std::string sanitizeFileComponent(const std::string& text, const std::string& fallback, std::size_t maxBytes) {
  static const std::string kForbidden = "<>:\"/\\|?*";
  std::string out;
  out.reserve(text.size());
  for (const char raw : text) {
    const unsigned char c = static_cast<unsigned char>(raw);
    const bool replace = c < 0x20 || c == 0x7f || std::isspace(c) != 0 || kForbidden.find(raw) != std::string::npos;
    if (replace) {
      if (out.empty() || out.back() != '_') out.push_back('_');
    } else {
      out.push_back(raw);
    }
  }
  const auto isTrim = [](char c) { return c == '_' || c == '.'; };
  while (!out.empty() && isTrim(out.back())) out.pop_back();
  std::size_t first = 0;
  while (first < out.size() && isTrim(out[first])) ++first;
  out.erase(0, first);
  if (out.size() > maxBytes) {
    std::size_t cut = maxBytes;
    while (cut > 0 && (static_cast<unsigned char>(out[cut]) & 0xC0) == 0x80) --cut;  // never split a UTF-8 sequence
    out.erase(cut);
    while (!out.empty() && isTrim(out.back())) out.pop_back();
  }
  return out.empty() ? fallback : out;
}

MasterExportPlan planMasterToolingExport(const std::vector<MasterToolingSetState>& sets, const std::string& modelName) {
  MasterExportPlan plan;
  plan.stem = sanitizeFileComponent(stemOf(modelName), "part");
  std::set<std::string> used;  // lowercase: Windows and macOS file systems are case-insensitive

  for (const MasterToolingSetState& state : sets) {
    const auto excludeSet = [&](const std::string& reason) {
      plan.excluded.push_back({state.moldPartId, state.moldPartName, {}, state.status, reason});
    };
    if (state.status == "stale") {
      excludeSet("The part or its settings changed after this tooling was generated; regenerate the Master Mold.");
      continue;
    }
    if (state.status == "blocked") {
      excludeSet(state.failureMessage.value_or("Tooling could not be generated for this working-mold part."));
      continue;
    }
    if (state.status != "current") {
      excludeSet("Status '" + state.status + "' is not exportable.");
      continue;
    }
    if (!state.set || state.set->assembly.pieces.empty()) {
      excludeSet("This tooling set has no pieces.");
      continue;
    }
    for (const MasterToolingPiece& piece : state.set->assembly.pieces) {
      const std::string label = state.moldPartName + " / " + piece.name;
      if (piece.mesh.empty()) {
        plan.excluded.push_back({state.moldPartId, state.moldPartName, piece.pieceId, state.status, "The piece has no geometry."});
        continue;
      }
      if (!piece.watertight) plan.warnings.push_back(label + ": not watertight; it may not print correctly.");
      if (!piece.manifold) plan.warnings.push_back(label + ": not a valid manifold solid; it may not print correctly.");
      if (!piece.fitsBuildVolume) plan.warnings.push_back(label + ": larger than the printer build volume.");

      const std::string base = plan.stem + "_master_" + sanitizeFileComponent(state.moldPartName, "set") + "_" +
                               sanitizeFileComponent(piece.name, "piece");
      std::string fileName = base + ".stl";
      for (int suffix = 2; used.count(toLowerAscii(fileName)) != 0; ++suffix) fileName = base + "_" + std::to_string(suffix) + ".stl";
      used.insert(toLowerAscii(fileName));
      plan.files.push_back({state.moldPartId, state.moldPartName, piece.pieceId, piece.name, fileName, &state, &piece});
    }
  }
  return plan;
}

namespace {

struct WrittenFile {
  const PlannedFile* planned = nullptr;
  std::string sha256;
  std::uintmax_t bytes = 0;
};

QJsonObject pieceObject(const WrittenFile& written) {
  const MasterToolingPiece& piece = *written.planned->piece;
  QJsonObject o{{"pieceId", q(piece.pieceId)},
                {"name", q(piece.name)},
                {"file", q(written.planned->fileName)},
                {"bytes", static_cast<double>(written.bytes)},
                {"sha256", q(written.sha256)},
                {"triangleCount", static_cast<double>(piece.mesh.triangleCount())},
                {"volumeMm3", piece.volumeMm3},
                {"bounds", boundsObject(piece.bounds)},
                {"watertight", piece.watertight},
                {"manifold", piece.manifold},
                {"fitsBuildVolume", piece.fitsBuildVolume},
                {"releaseDirection", q(piece.releaseDirection)},
                {"regions", stringArray(piece.regions)},
                {"registrationFeatureIds", stringArray(piece.toolingRegistrationFeatureIds)}};
  if (piece.directionVector) o.insert("releaseDirectionVector", pointArray(*piece.directionVector));
  return o;
}

struct WrittenThreeMf {
  std::string fileName, sha256;
  std::uintmax_t bytes = 0;
  std::vector<std::string> objectNames;
};

QByteArray buildManifest(const MasterExportPlan& plan, const std::vector<WrittenFile>& written, const MasterExportOptions& options,
                         const std::vector<std::string>& warnings, const WrittenThreeMf* threeMf) {
  // Group the written files by tooling set, keeping the plan's order.
  QJsonArray sets;
  std::vector<const MasterToolingSetState*> order;
  for (const WrittenFile& w : written) {
    if (std::find(order.begin(), order.end(), w.planned->state) == order.end()) order.push_back(w.planned->state);
  }
  for (const MasterToolingSetState* state : order) {
    const MasterToolingSet& set = *state->set;
    QJsonArray pieces;
    for (const WrittenFile& w : written) {
      if (w.planned->state == state) pieces.append(pieceObject(w));
    }
    QJsonArray sequence;
    for (const MasterReleaseStep& step : set.assembly.releaseSequence) {
      QJsonObject s{{"stepIndex", step.stepIndex},
                    {"pieceId", q(step.pieceId)},
                    {"direction", q(step.direction)},
                    {"clearanceDistanceMm", step.clearanceDistanceMm},
                    {"collisionVerified", step.collisionVerified}};
      if (step.directionVector) s.insert("directionVector", pointArray(*step.directionVector));
      sequence.append(s);
    }
    QJsonArray registration;
    for (const MasterToolingRegistrationFeature& f : set.assembly.registrationFeatures) {
      registration.append(QJsonObject{{"featureId", q(f.featureId)}, {"kind", q(f.kind)}, {"malePieceId", q(f.malePieceId)}, {"femalePieceId", q(f.femalePieceId)}});
    }
    sets.append(QJsonObject{{"moldPartId", q(state->moldPartId)},
                            {"moldPartName", q(state->moldPartName)},
                            {"releaseMode", q(set.releaseMode)},
                            {"sourceSignature", q(set.sourceSignature)},
                            {"fingerprint", q(set.fingerprint)},
                            {"warnings", stringArray(set.warnings)},
                            {"pieces", pieces},
                            {"releaseSequence", sequence},
                            {"registrationFeatures", registration}});
  }
  QJsonArray excluded;
  for (const ExcludedItem& e : plan.excluded) {
    excluded.append(QJsonObject{{"moldPartId", q(e.moldPartId)}, {"moldPartName", q(e.moldPartName)}, {"pieceId", q(e.pieceId)}, {"status", q(e.status)}, {"reason", q(e.reason)}});
  }
  QJsonObject completeness{{"unportedPathsReached", options.unportedPathsReached}, {"unportedPaths", stringArray(options.unportedPaths)}};
  if (options.unportedPathsReached) {
    completeness.insert("note", QStringLiteral("This result may be missing options the full planner would try."));
  }
  const QJsonObject root{{"format", QStringLiteral("craft.master-tooling-export")},
                         {"formatVersion", 1},
                         {"app", QJsonObject{{"name", QStringLiteral("Craft")}, {"version", q(options.appVersion)}}},
                         {"exportedAt", q(options.exportedAtUtc)},
                         {"source", QJsonObject{{"model", q(options.modelName)}, {"generationVersion", options.generationVersion}}},
                         {"units", QStringLiteral("millimeters")},
                         {"upAxis", QStringLiteral("Z")},
                         {"coordinateFrame", QStringLiteral("model world frame (the grounded part, as shown in the viewport); no per-piece transform is applied")},
                         {"stlEncoding", QStringLiteral("binary, float32 coordinates, facet normals recomputed from winding")},
                         {"completeness", completeness},
                         {"toolingSets", sets},
                         {"excluded", excluded},
                         {"warnings", stringArray(warnings)}};
  QJsonObject withThreeMf = root;
  if (threeMf) {
    // Additive (formatVersion stays 1): readers that do not know the member ignore it.
    withThreeMf.insert("threeMf", QJsonObject{{"file", q(threeMf->fileName)},
                                              {"bytes", static_cast<double>(threeMf->bytes)},
                                              {"sha256", q(threeMf->sha256)},
                                              {"unit", QStringLiteral("millimeter")},
                                              {"objects", stringArray(threeMf->objectNames)}});
  }
  return QJsonDocument(withThreeMf).toJson(QJsonDocument::Indented);
}

void writeBytes(const fs::path& path, const char* data, std::size_t size) {
  std::ofstream stream(path, std::ios::binary | std::ios::trunc);
  if (!stream || !stream.write(data, static_cast<std::streamsize>(size))) {
    writeFailed("The file '" + path.filename().string() + "' could not be written (disk full, permission denied, or the path is too long).");
  }
}

std::vector<std::uint8_t> readBytes(const fs::path& path) {
  std::ifstream stream(path, std::ios::binary | std::ios::ate);
  if (!stream) writeFailed("The file '" + path.filename().string() + "' could not be read back for verification.");
  const std::streamsize size = stream.tellg();
  stream.seekg(0);
  std::vector<std::uint8_t> bytes(static_cast<std::size_t>(size));
  if (size > 0 && !stream.read(reinterpret_cast<char*>(bytes.data()), size)) {
    writeFailed("The file '" + path.filename().string() + "' could not be read back for verification.");
  }
  return bytes;
}

std::string excludedSummary(const std::vector<ExcludedItem>& excluded) {
  if (excluded.empty()) return "There are no Master tooling pieces to export. Generate the Master Mold first.";
  std::string text = "No Master tooling piece can be exported.";
  for (const ExcludedItem& e : excluded) {
    text += " " + e.moldPartName + (e.pieceId.empty() ? "" : " (" + e.pieceId + ")") + ": " + e.reason;
  }
  return text;
}

}  // namespace

MasterExportResult writeMasterToolingExport(const MasterExportPlan& plan, const fs::path& parentFolder, const MasterExportOptions& options,
                                            const CancellationToken& cancel) {
  if (plan.files.empty()) throw CodedError("master_export_nothing", excludedSummary(plan.excluded));

  std::error_code ec;
  fs::create_directories(parentFolder, ec);
  if (ec || !fs::is_directory(parentFolder)) writeFailed("The export folder '" + parentFolder.string() + "' could not be created.");

  // Never overwrite: take the first free "<stem>_master_tooling[_N]".
  const std::string baseName = plan.stem + "_master_tooling";
  fs::path finalFolder;
  for (int n = 1; n < 10000; ++n) {
    finalFolder = parentFolder / pathFromUtf8(n == 1 ? baseName : baseName + "_" + std::to_string(n));
    if (!fs::exists(finalFolder, ec)) break;
    if (n == 9999) writeFailed("Too many earlier exports exist in '" + parentFolder.string() + "'.");
  }
  fs::path tempFolder = finalFolder;
  tempFolder += ".craft-export-tmp";
  fs::remove_all(tempFolder, ec);  // a leftover of an earlier interrupted export of the same name
  ec.clear();
  fs::create_directory(tempFolder, ec);
  if (ec) writeFailed("The export folder could not be created in '" + parentFolder.string() + "'.");

  struct Cleanup {
    fs::path path;
    bool armed = true;
    ~Cleanup() {
      if (!armed) return;
      std::error_code ignored;
      fs::remove_all(path, ignored);
    }
  } cleanup{tempFolder};

  std::vector<WrittenFile> written;
  std::uintmax_t totalBytes = 0;
  for (const PlannedFile& file : plan.files) {
    if (cancel.isCancelled()) throw CodedError("cancelled", "The export was cancelled.");
    const std::vector<std::uint8_t> bytes = stl::encodeBinary(file.piece->mesh, "master " + file.pieceId);
    const std::string hash = sha256Of(bytes.data(), bytes.size());
    const fs::path target = tempFolder / pathFromUtf8(file.fileName);
    writeBytes(target, reinterpret_cast<const char*>(bytes.data()), bytes.size());

    // Read it back: what is on disk must be what was encoded, and must parse as the piece it claims to be.
    const std::vector<std::uint8_t> back = readBytes(target);
    if (back.size() != bytes.size() || sha256Of(back.data(), back.size()) != hash) {
      writeFailed("Verification failed for '" + file.fileName + "': the file on disk differs from what was written.");
    }
    try {
      const stl::ReadResult parsed = stl::parse(back);
      if (parsed.facetCount != file.piece->mesh.triangleCount()) {
        writeFailed("Verification failed for '" + file.fileName + "': it holds " + std::to_string(parsed.facetCount) + " triangles, expected " +
                    std::to_string(file.piece->mesh.triangleCount()) + ".");
      }
    } catch (const CodedError& error) {
      if (error.code() == "master_export_write_failed") throw;
      writeFailed("Verification failed for '" + file.fileName + "': " + error.what());
    }
    written.push_back({&file, hash, bytes.size()});
    totalBytes += bytes.size();
  }

  std::vector<std::string> warnings = plan.warnings;
  std::optional<WrittenThreeMf> threeMf;
  if (options.write3mf) {
    if (cancel.isCancelled()) throw CodedError("cancelled", "The export was cancelled.");
    std::vector<threemf::Object> objects;
    std::vector<std::string> names;
    for (const WrittenFile& w : written) names.push_back(w.planned->moldPartName + " / " + w.planned->pieceName);
    for (std::size_t i = 0; i < written.size(); ++i) objects.push_back({names[i], &written[i].planned->piece->mesh});
    const std::vector<std::uint8_t> bytes = threemf::encode(objects, plan.stem + " master tooling");
    const std::string fileName = plan.stem + "_master_tooling.3mf";
    const fs::path target = tempFolder / pathFromUtf8(fileName);
    writeBytes(target, reinterpret_cast<const char*>(bytes.data()), bytes.size());

    // Read it back and check it independently of the writer: the same bytes, a sound package, and one object per piece with the
    // piece's triangle count. A piece the engine itself flagged (not watertight / not manifold) is allowed to fail the closed-mesh
    // check; a piece it called clean that the independent check finds open is reported as a warning, never hidden.
    const std::vector<std::uint8_t> back = readBytes(target);
    if (back != bytes) writeFailed("Verification failed for '" + fileName + "': the file on disk differs from what was written.");
    const threemf::Report report = threemf::validate(back);
    if (report.objects.size() != written.size() || report.buildItems != written.size() || report.unit != "millimeter") {
      writeFailed("Verification failed for '" + fileName + "': " + (report.problem.empty() ? std::string("the package does not hold one object per piece in millimetres.") : report.problem));
    }
    for (std::size_t i = 0; i < written.size(); ++i) {
      const threemf::ObjectReport& o = report.objects[i];
      const MasterToolingPiece& piece = *written[i].planned->piece;
      if (o.name != names[i] || o.triangles != piece.mesh.triangleCount() || !o.indicesInRange || !o.noDegenerateTriangles) {
        writeFailed("Verification failed for '" + fileName + "': object '" + names[i] + "' does not match its piece (" + std::to_string(o.triangles) + " triangles, expected " +
                    std::to_string(piece.mesh.triangleCount()) + ").");
      }
      if (!o.closedTwoManifold && piece.watertight && piece.manifold) {
        warnings.push_back(names[i] + ": the 3MF check found the mesh not closed although the engine reported it clean.");
      }
    }
    totalBytes += bytes.size();
    threeMf = WrittenThreeMf{fileName, sha256Of(bytes.data(), bytes.size()), bytes.size(), names};
  }

  if (cancel.isCancelled()) throw CodedError("cancelled", "The export was cancelled.");
  const QByteArray manifest = buildManifest(plan, written, options, warnings, threeMf ? &*threeMf : nullptr);
  writeBytes(tempFolder / "manifest.json", manifest.constData(), static_cast<std::size_t>(manifest.size()));
  totalBytes += static_cast<std::uintmax_t>(manifest.size());

  fs::rename(tempFolder, finalFolder, ec);
  if (ec) writeFailed("The finished export could not be moved into place as '" + finalFolder.string() + "' (" + ec.message() + ").");
  cleanup.armed = false;

  MasterExportResult result;
  result.folder = finalFolder;
  result.manifest = finalFolder / "manifest.json";
  for (const WrittenFile& w : written) result.files.push_back(finalFolder / pathFromUtf8(w.planned->fileName));
  if (threeMf) result.threeMf = finalFolder / pathFromUtf8(threeMf->fileName);
  result.warnings = warnings;
  result.excluded = plan.excluded;
  result.totalBytes = totalBytes;
  return result;
}

}  // namespace craft::toolingexport
