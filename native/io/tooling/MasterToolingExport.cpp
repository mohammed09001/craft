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
#include <system_error>

#include "path/ExtendedPath.h"
#include "stl/Stl.h"
#include "threemf/ThreeMf.h"

namespace craft::toolingexport {

namespace fs = std::filesystem;

namespace {

constexpr double kPlateGapMm = 10;  // gap between the two masters on the 3MF plate

fs::path pathFromUtf8(const std::string& text) {
  return fs::path(std::u8string(reinterpret_cast<const char8_t*>(text.data()), text.size()));
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
  return QCryptographicHash::hash(QByteArrayView(reinterpret_cast<const char*>(data), static_cast<qsizetype>(size)), QCryptographicHash::Sha256).toHex().toStdString();
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

MasterExportPlan planMasterToolingExport(const MasterExportSource& source, const std::string& modelName) {
  MasterExportPlan plan;
  plan.stem = sanitizeFileComponent(stemOf(modelName), "part");
  const auto excludeAll = [&](const std::string& reason) { plan.excluded.push_back({"Master Mold", source.status, reason}); };
  if (source.status == "stale") { excludeAll("The part or its settings changed after the masters were generated; regenerate the Master Mold."); return plan; }
  if (source.status == "blocked") { excludeAll(source.failureMessage.empty() ? "No feasible two-master plan was found." : source.failureMessage); return plan; }
  if (source.status == "unavailable" || source.status.empty()) { excludeAll("There is no Master Mold result. Generate the Master Mold first."); return plan; }
  if (source.status != "current") { excludeAll("Status '" + source.status + "' is not exportable."); return plan; }
  if (!source.plan) { excludeAll("There is no Master Mold result. Generate the Master Mold first."); return plan; }

  bool complete = true;
  for (const MasterTool& tool : source.plan->masters) {
    if (tool.mesh.empty()) {
      plan.excluded.push_back({tool.name, "current", "The master has no geometry."});
      complete = false;
      continue;
    }
    if (!tool.facts.watertight || !tool.facts.manifold || tool.facts.componentCount != 1)
      plan.warnings.push_back(tool.name + ": not a single closed manifold solid; it may not print correctly.");
    plan.files.push_back({tool.name, plan.stem + "_master_" + (tool.id == MasterToolId::A ? "A" : "B") + ".stl", source.plan, &tool});
  }
  if (!complete) {  // a Master Mold is a pair
    plan.files.clear();
    plan.excluded.push_back({"Master Mold", "current", "A Master Mold is exported as a pair; nothing was written because one master is unusable."});
  }
  for (const std::string& w : source.plan->warnings) plan.warnings.push_back(w);
  return plan;
}

namespace {

struct WrittenFile {
  const PlannedFile* planned = nullptr;
  std::string sha256;
  std::uintmax_t bytes = 0;
};

struct WrittenThreeMf {
  std::string fileName, sha256;
  std::uintmax_t bytes = 0;
  std::vector<std::string> objectNames;
};

QJsonArray matrixArray(const std::array<double, 16>& m) {
  QJsonArray a;
  for (const double v : m) a.append(v);
  return a;
}

QByteArray buildManifest(const MasterExportPlan& plan, const std::vector<WrittenFile>& written, const MasterExportOptions& options,
                         const std::vector<std::string>& warnings, const WrittenThreeMf* threeMf) {
  const MasterMoldPlan& mold = *plan.files.front().plan;
  QJsonArray masters;
  for (const WrittenFile& w : written) {
    const MasterTool& t = *w.planned->tool;
    masters.append(QJsonObject{{"id", t.id == MasterToolId::A ? "A" : "B"},
                               {"name", q(t.name)},
                               {"file", q(w.planned->fileName)},
                               {"bytes", static_cast<double>(w.bytes)},
                               {"sha256", q(w.sha256)},
                               {"triangleCount", static_cast<double>(t.mesh.triangleCount())},
                               {"volumeMm3", t.facts.volumeMm3},
                               {"bounds", boundsObject(t.facts.bounds)},
                               {"watertight", t.facts.watertight},
                               {"manifold", t.facts.manifold},
                               {"bodies", t.facts.componentCount},
                               {"fillVolumeMm3", t.fillVolumeMm3},
                               {"minimumWallMm", t.minimumWallMm},
                               {"pourDirection", pointArray(t.pourDirection)},
                               {"printFromModel", matrixArray(t.printFromModel)},
                               {"registrationFeatures", stringArray(t.registrationFeatureIds)},
                               {"inletFeatures", stringArray(t.ventFeatureIds)}});
  }
  QJsonArray halves;
  for (const VirtualWorkingHalf& h : mold.halves) {
    halves.append(QJsonObject{{"id", h.id == MasterToolId::A ? "A" : "B"},
                              {"name", q(h.name)},
                              {"volumeMm3", h.facts.volumeMm3},
                              {"bounds", boundsObject(h.facts.bounds)},
                              {"releaseDirection", pointArray(h.releaseDirection)},
                              {"exported", false}});
  }
  QJsonArray checks;
  for (const MasterReleaseCheck& c : mold.releaseChecks) {
    checks.append(QJsonObject{{"stage", q(masterReleaseStageName(c.stage))},
                              {"subject", q(masterToolName(c.subject))},
                              {"verification", q(masterVerificationName(c.verification))},
                              {"direction", pointArray(c.direction)},
                              {"marginMm", c.marginMm},
                              {"method", q(c.method)},
                              {"note", q(c.note)}});
  }
  QJsonArray materials;
  for (const MasterMaterialEstimate& m : mold.materials) {
    QJsonObject o{{"master", q(masterToolName(m.id))},
                  {"fillVolumeMm3", m.fillVolumeMm3},
                  {"wasteMargin", m.wasteMargin},
                  {"volumeWithWasteMm3", m.volumeWithWasteMm3}};
    if (m.densityGPerCm3) o.insert("densityGPerCm3", *m.densityGPerCm3);
    if (m.massG) o.insert("massG", *m.massG);
    materials.append(o);
  }
  QJsonArray excluded;
  for (const ExcludedItem& e : plan.excluded) excluded.append(QJsonObject{{"name", q(e.name)}, {"status", q(e.status)}, {"reason", q(e.reason)}});

  QJsonObject root{{"format", QStringLiteral("craft.master-tooling-export")},
                   {"formatVersion", 2},
                   {"app", QJsonObject{{"name", QStringLiteral("Craft")}, {"version", q(options.appVersion)}}},
                   {"exportedAt", q(options.exportedAtUtc)},
                   {"source", QJsonObject{{"model", q(options.modelName)}, {"generationVersion", options.generationVersion}, {"geometryVersion", q(mold.sourceGeometryVersion)}}},
                   {"units", QStringLiteral("millimeters")},
                   {"upAxis", QStringLiteral("Z")},
                   {"coordinateFrame", QStringLiteral("each master in its own print frame: bed on z = 0, open pour face toward +Z; printFromModel maps the model frame to it")},
                   {"stlEncoding", QStringLiteral("binary, float32 coordinates, facet normals recomputed from winding")},
                   {"seam", QJsonObject{{"kind", q(mold.seam.kind)}, {"pullAxis", pointArray(mold.seam.pullAxis)}, {"planeOffsetMm", mold.seam.planeOffsetMm}, {"description", q(mold.seam.description)}}},
                   {"masters", masters},
                   {"virtualWorkingHalves", halves},
                   {"releaseChecks", checks},
                   {"materialEstimates", materials},
                   {"fidelity", QJsonObject{{"toleranceMm", mold.fidelity.toleranceMm}, {"deviationMm", mold.fidelity.maxDeviationMm}, {"method", q(mold.fidelity.method)}}},
                   {"residualUncertainty", stringArray(mold.residualUncertainty)},
                   {"fingerprint", q(mold.fingerprint)},
                   {"excluded", excluded},
                   {"warnings", stringArray(warnings)}};
  if (threeMf) {
    root.insert("threeMf", QJsonObject{{"file", q(threeMf->fileName)},
                                       {"bytes", static_cast<double>(threeMf->bytes)},
                                       {"sha256", q(threeMf->sha256)},
                                       {"unit", QStringLiteral("millimeter")},
                                       {"layout", QStringLiteral("masters side by side on one plate: Master B is moved along +X; the STL files are not")},
                                       {"objects", stringArray(threeMf->objectNames)}});
  }
  return QJsonDocument(root).toJson(QJsonDocument::Indented);
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
  if (excluded.empty()) return "There are no Master tools to export. Generate the Master Mold first.";
  std::string text = "The Master Mold cannot be exported.";
  for (const ExcludedItem& e : excluded) text += " " + e.name + ": " + e.reason;
  return text;
}

}  // namespace

MasterExportResult writeMasterToolingExport(const MasterExportPlan& plan, const fs::path& requestedParent, const MasterExportOptions& options,
                                            const CancellationToken& cancel) {
  if (plan.files.size() != static_cast<std::size_t>(kMasterToolCount)) throw CodedError("master_export_nothing", excludedSummary(plan.excluded));

  // Everything below is built from parentFolder, in the extended-length form when the folder, the export folder and the file names it adds can
  // pass MAX_PATH (a deep OneDrive folder): 230 covers the folder name and the longest file name. The result and the messages use the ordinary form.
  const fs::path parentFolder = io::extendedLength(requestedParent, 230);
  std::error_code ec;
  fs::create_directories(parentFolder, ec);
  if (ec || !fs::is_directory(parentFolder)) writeFailed("The export folder '" + requestedParent.string() + "' could not be created.");

  // Never overwrite: take the first free "<stem>_master_tooling[_N]".
  const std::string baseName = plan.stem + "_master_tooling";
  fs::path finalFolder;
  for (int n = 1; n < 10000; ++n) {
    finalFolder = parentFolder / pathFromUtf8(n == 1 ? baseName : baseName + "_" + std::to_string(n));
    if (!fs::exists(finalFolder, ec)) break;
    if (n == 9999) writeFailed("Too many earlier exports exist in '" + requestedParent.string() + "'.");
  }
  fs::path tempFolder = finalFolder;
  tempFolder += ".craft-export-tmp";
  fs::remove_all(tempFolder, ec);  // a leftover of an earlier interrupted export of the same name
  ec.clear();
  fs::create_directory(tempFolder, ec);
  if (ec) writeFailed("The export folder could not be created in '" + requestedParent.string() + "'.");

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
    const std::vector<std::uint8_t> bytes = stl::encodeBinary(file.tool->mesh, file.toolName);
    const std::string hash = sha256Of(bytes.data(), bytes.size());
    const fs::path target = tempFolder / pathFromUtf8(file.fileName);
    writeBytes(target, reinterpret_cast<const char*>(bytes.data()), bytes.size());

    // Read it back: what is on disk must be what was encoded, and must parse as the master it claims to be.
    const std::vector<std::uint8_t> back = readBytes(target);
    if (back.size() != bytes.size() || sha256Of(back.data(), back.size()) != hash) {
      writeFailed("Verification failed for '" + file.fileName + "': the file on disk differs from what was written.");
    }
    try {
      const stl::ReadResult parsed = stl::parse(back);
      if (parsed.facetCount != file.tool->mesh.triangleCount()) {
        writeFailed("Verification failed for '" + file.fileName + "': it holds " + std::to_string(parsed.facetCount) + " triangles, expected " +
                    std::to_string(file.tool->mesh.triangleCount()) + ".");
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
    // One plate: Master B moves along +X so the two masters do not overlap when the package is opened.
    std::vector<MeshPayload> plate;
    double nextX = 0;
    for (const WrittenFile& w : written) {
      MeshPayload m = w.planned->tool->mesh;
      const Bounds3& b = w.planned->tool->facts.bounds;
      const double shift = nextX - b.min.x;
      for (std::size_t i = 0; i < m.vertexCount(); ++i) m.positions[3 * i] += shift;
      nextX += (b.max.x - b.min.x) + kPlateGapMm;
      plate.push_back(std::move(m));
    }
    std::vector<threemf::Object> objects;
    std::vector<std::string> names;
    for (std::size_t i = 0; i < written.size(); ++i) {
      names.push_back(written[i].planned->toolName);
      objects.push_back({names.back(), &plate[i]});
    }
    const std::vector<std::uint8_t> bytes = threemf::encode(objects, plan.stem + " master tooling");
    const std::string fileName = plan.stem + "_master_tooling.3mf";
    const fs::path target = tempFolder / pathFromUtf8(fileName);
    writeBytes(target, reinterpret_cast<const char*>(bytes.data()), bytes.size());

    // Read it back and check it independently of the writer: the same bytes, a sound package, and exactly two objects with the masters' triangle counts.
    const std::vector<std::uint8_t> back = readBytes(target);
    if (back != bytes) writeFailed("Verification failed for '" + fileName + "': the file on disk differs from what was written.");
    const threemf::Report report = threemf::validate(back);
    if (report.objects.size() != written.size() || report.buildItems != written.size() || report.unit != "millimeter") {
      writeFailed("Verification failed for '" + fileName + "': " + (report.problem.empty() ? std::string("the package does not hold the two masters in millimetres.") : report.problem));
    }
    for (std::size_t i = 0; i < written.size(); ++i) {
      const threemf::ObjectReport& o = report.objects[i];
      const MasterTool& tool = *written[i].planned->tool;
      if (o.name != names[i] || o.triangles != tool.mesh.triangleCount() || !o.indicesInRange || !o.noDegenerateTriangles) {
        writeFailed("Verification failed for '" + fileName + "': object '" + names[i] + "' does not match its master (" + std::to_string(o.triangles) + " triangles, expected " +
                    std::to_string(tool.mesh.triangleCount()) + ").");
      }
      if (!o.closedTwoManifold && tool.facts.watertight && tool.facts.manifold) warnings.push_back(names[i] + ": the 3MF check found the mesh not closed although the planner reported it clean.");
    }
    totalBytes += bytes.size();
    threeMf = WrittenThreeMf{fileName, sha256Of(bytes.data(), bytes.size()), bytes.size(), names};
  }

  if (cancel.isCancelled()) throw CodedError("cancelled", "The export was cancelled.");
  const QByteArray manifest = buildManifest(plan, written, options, warnings, threeMf ? &*threeMf : nullptr);
  writeBytes(tempFolder / "manifest.json", manifest.constData(), static_cast<std::size_t>(manifest.size()));
  totalBytes += static_cast<std::uintmax_t>(manifest.size());

  fs::rename(tempFolder, finalFolder, ec);
  if (ec) writeFailed("The finished export could not be moved into place as '" + io::displayPath(finalFolder).string() + "' (" + ec.message() + ").");
  cleanup.armed = false;

  MasterExportResult result;
  const fs::path shownFolder = io::displayPath(finalFolder);   // what the user recognises: no \\?\ prefix in the panel, the log or the manifest
  result.folder = shownFolder;
  result.manifest = shownFolder / "manifest.json";
  for (const WrittenFile& w : written) result.files.push_back(shownFolder / pathFromUtf8(w.planned->fileName));
  if (threeMf) result.threeMf = shownFolder / pathFromUtf8(threeMf->fileName);
  result.warnings = warnings;
  result.excluded = plan.excluded;
  result.totalBytes = totalBytes;
  return result;
}

}  // namespace craft::toolingexport
