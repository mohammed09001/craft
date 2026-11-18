#include "project/ProjectJson.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QString>

namespace craft::project {

namespace {

QString q(const std::string& s) { return QString::fromStdString(s); }
std::string s(const QJsonValue& v) { return v.toString().toStdString(); }

QJsonObject vec(const Vec3& v) { return {{"x", v.x}, {"y", v.y}, {"z", v.z}}; }

struct Reader {
  std::string error;
  bool ok() const { return error.empty(); }
  void fail(const std::string& message) { if (error.empty()) error = message; }

  const QJsonValue get(const QJsonObject& o, const char* key, const std::string& path, bool required = true) {
    if (!o.contains(key)) {
      if (required) fail(path + "." + key + " is missing.");
      return QJsonValue(QJsonValue::Undefined);
    }
    return o[key];
  }
  std::string str(const QJsonObject& o, const char* key, const std::string& path, bool required = true) {
    const QJsonValue v = get(o, key, path, required);
    if (v.isUndefined()) return {};
    if (!v.isString()) { fail(path + "." + key + " must be a string."); return {}; }
    return v.toString().toStdString();
  }
  double num(const QJsonObject& o, const char* key, const std::string& path, bool required = true, double fallback = 0) {
    const QJsonValue v = get(o, key, path, required);
    if (v.isUndefined()) return fallback;
    if (!v.isDouble()) { fail(path + "." + key + " must be a number."); return fallback; }
    return v.toDouble();
  }
  bool boolean(const QJsonObject& o, const char* key, const std::string& path, bool required = true, bool fallback = false) {
    const QJsonValue v = get(o, key, path, required);
    if (v.isUndefined()) return fallback;
    if (!v.isBool()) { fail(path + "." + key + " must be a boolean."); return fallback; }
    return v.toBool();
  }
  const QJsonObject object(const QJsonObject& o, const char* key, const std::string& path, bool required = true) {
    const QJsonValue v = get(o, key, path, required);
    if (v.isUndefined()) return {};
    if (!v.isObject()) { fail(path + "." + key + " must be an object."); return {}; }
    return v.toObject();
  }
  const QJsonArray array(const QJsonObject& o, const char* key, const std::string& path, bool required = true) {
    const QJsonValue v = get(o, key, path, required);
    if (v.isUndefined()) return {};
    if (!v.isArray()) { fail(path + "." + key + " must be an array."); return {}; }
    return v.toArray();
  }
  Vec3 vec3(const QJsonObject& o, const char* key, const std::string& path) {
    const QJsonObject v = object(o, key, path);
    return {num(v, "x", path + "." + key), num(v, "y", path + "." + key), num(v, "z", path + "." + key)};
  }
  std::optional<SprueScalarRecord> scalar(const QJsonObject& o, const char* key, const std::string& path) {
    const QJsonValue v = get(o, key, path, false);
    if (v.isUndefined() || v.isNull()) return std::nullopt;
    if (!v.isObject()) { fail(path + "." + key + " must be an object or null."); return std::nullopt; }
    const QJsonObject d = v.toObject();
    return SprueScalarRecord{num(d, "valueMm", path + "." + key), num(d, "unconstrainedValueMm", path + "." + key), str(d, "source", path + "." + key)};
  }
};

QJsonValue scalarJson(const std::optional<SprueScalarRecord>& r) {
  if (!r) return QJsonValue(QJsonValue::Null);
  return QJsonObject{{"valueMm", r->valueMm}, {"unconstrainedValueMm", r->unconstrainedValueMm}, {"source", q(r->source)}};
}

}  // namespace

const std::vector<std::string>& knownManifestMembers() {
  static const std::vector<std::string> known{"schema",   "formatVersion", "app",       "projectId", "createdAt", "modifiedAt", "units",
                                              "coordinateSystem", "assets", "model",    "moldInputs", "sprues",   "segmentation", "view", "workflow", "autosave"};
  return known;
}

QJsonObject documentToManifest(const Document& d, const std::vector<AssetEntry>& assets, int formatMajor, int formatMinor) {
  QJsonObject m;
  // Preserved extensions first so a (buggy) extension can never shadow a known member.
  if (!d.preservedExtensionsJson.empty()) {
    const QJsonObject extensions = QJsonDocument::fromJson(QByteArray::fromStdString(d.preservedExtensionsJson)).object();
    for (auto it = extensions.begin(); it != extensions.end(); ++it) m.insert(it.key(), it.value());
  }
  m["schema"] = kSchema;
  m["formatVersion"] = QJsonObject{{"major", formatMajor}, {"minor", formatMinor}};
  m["app"] = QJsonObject{{"name", "Craft"}, {"version", q(d.appVersion)}};
  m["projectId"] = q(d.projectId);
  m["createdAt"] = q(d.createdAt);
  m["modifiedAt"] = q(d.modifiedAt);
  m["units"] = "mm";
  m["coordinateSystem"] = "z-up";

  QJsonArray assetList;
  for (const AssetEntry& a : assets)
    assetList.append(QJsonObject{{"id", q(a.id)}, {"role", q(a.role)}, {"name", q(a.name)}, {"mediaType", q(a.mediaType)},
                                 {"offset", static_cast<double>(a.offset)}, {"size", static_cast<double>(a.size)}, {"sha256", q(a.sha256)}});
  m["assets"] = assetList;

  if (d.model) {
    const ModelReference& r = *d.model;
    m["model"] = QJsonObject{{"fileName", q(r.fileName)},       {"storage", q(r.storage)},          {"assetId", q(r.assetId)},
                             {"linkedPath", q(r.linkedPath)},   {"sizeBytes", static_cast<double>(r.sizeBytes)}, {"sourceSizeBytes", static_cast<double>(r.sourceSizeBytes)}, {"sha256", q(r.sha256)},
                             {"triangleCount", static_cast<double>(r.triangleCount)}, {"sourceEncoding", q(r.sourceEncoding)},
                             {"geometryVersion", q(r.geometryVersion)}};
  } else {
    m["model"] = QJsonValue(QJsonValue::Null);
  }

  QJsonArray faces;
  for (const CutFaceInput& f : d.mold.cutFaces)
    faces.append(QJsonObject{{"face", q(f.face)}, {"enabled", f.enabled}, {"position", f.position ? QJsonValue(*f.position) : QJsonValue(QJsonValue::Null)}});
  m["moldInputs"] = QJsonObject{{"moldClearanceMm", d.mold.moldClearanceMm}, {"cavityClearanceMm", d.mold.cavityClearanceMm}, {"cutFaces", faces}};

  QJsonArray sprues;
  for (const SprueRecord& r : d.sprues) {
    QJsonArray warnings;
    for (const auto& w : r.designWarnings) warnings.append(q(w));
    sprues.append(QJsonObject{{"operationId", q(r.operationId)},
                              {"creationOrder", r.creationOrder},
                              {"position", vec(r.position)},
                              {"inwardDirection", vec(r.inwardDirection)},
                              {"profile", QJsonObject{{"mainDiameterMm", r.mainDiameterMm}, {"entryNeckDiameterMm", r.entryNeckDiameterMm}, {"entryNeckLengthMm", r.entryNeckLengthMm}}},
                              {"design", QJsonObject{{"source", q(r.designSource)}, {"mainSection", scalarJson(r.mainSection)}, {"entryNeckDiameter", scalarJson(r.entryNeck)},
                                                     {"entryNeckLength", scalarJson(r.entryNeckLength)}, {"warnings", warnings}}},
                              {"validation", QJsonObject{{"status", q(r.validationStatus)}, {"reasonCode", q(r.validationReasonCode)}, {"message", q(r.validationMessage)}}}});
  }
  m["sprues"] = QJsonObject{{"items", sprues}, {"nextNumber", d.nextSprueNumber}};

  QJsonArray extensions;
  for (const auto& [axis, coordinate] : d.segmentation.extensions) extensions.append(QJsonObject{{"axis", q(axis)}, {"coordinateMm", coordinate}});
  m["segmentation"] = QJsonObject{{"printerVolumeMm", d.segmentation.printerVolumeMm ? QJsonValue(vec(*d.segmentation.printerVolumeMm)) : QJsonValue(QJsonValue::Null)},
                                  {"extensions", extensions}};

  QJsonObject view{{"theme", q(d.view.theme)}, {"showGrid", d.view.showGrid}, {"showAxes", d.view.showAxes}, {"showEdges", d.view.showEdges}, {"moldOpacity", d.view.moldOpacity}};
  view["camera"] = d.view.camera ? QJsonValue(QJsonObject{{"position", vec(d.view.camera->position)}, {"target", vec(d.view.camera->target)}}) : QJsonValue(QJsonValue::Null);
  m["view"] = view;
  if (d.autosaveOriginalPath) m["autosave"] = QJsonObject{{"originalPath", q(*d.autosaveOriginalPath)}};
  m["workflow"] = QJsonObject{{"segmentationPlanned", d.workflow.segmentationPlanned}, {"segmentationExecuted", d.workflow.segmentationExecuted}, {"moldGenerated", d.workflow.moldGenerated}};
  return m;
}

ManifestParse manifestToDocument(const QJsonObject& m) {
  ManifestParse out;
  Reader r;
  Document& d = out.document;

  if (r.str(m, "schema", "manifest") != kSchema && r.ok()) r.fail("manifest.schema is not \"craft.project\".");
  const QJsonObject version = r.object(m, "formatVersion", "manifest");
  out.formatMajor = static_cast<int>(r.num(version, "major", "manifest.formatVersion"));
  out.formatMinor = static_cast<int>(r.num(version, "minor", "manifest.formatVersion"));
  if (r.str(m, "units", "manifest") != "mm" && r.ok()) r.fail("manifest.units must be \"mm\" (Craft is millimeters throughout).");
  if (r.str(m, "coordinateSystem", "manifest") != "z-up" && r.ok()) r.fail("manifest.coordinateSystem must be \"z-up\".");
  const QJsonObject app = r.object(m, "app", "manifest");
  d.appVersion = r.str(app, "version", "manifest.app");
  d.projectId = r.str(m, "projectId", "manifest");
  d.createdAt = r.str(m, "createdAt", "manifest");
  d.modifiedAt = r.str(m, "modifiedAt", "manifest");

  for (const QJsonValue& value : r.array(m, "assets", "manifest")) {
    if (!value.isObject()) { r.fail("manifest.assets entries must be objects."); break; }
    const QJsonObject a = value.toObject();
    AssetEntry e;
    e.id = r.str(a, "id", "asset");
    e.role = r.str(a, "role", "asset");
    e.name = r.str(a, "name", "asset");
    e.mediaType = r.str(a, "mediaType", "asset");
    const double offset = r.num(a, "offset", "asset"), size = r.num(a, "size", "asset");
    if (offset < 0 || size < 0 || offset != static_cast<double>(static_cast<std::uint64_t>(offset)) || size != static_cast<double>(static_cast<std::uint64_t>(size)))
      r.fail("asset " + e.id + " has an invalid offset or size.");
    e.offset = static_cast<std::uint64_t>(offset);
    e.size = static_cast<std::uint64_t>(size);
    e.sha256 = r.str(a, "sha256", "asset");
    out.assets.push_back(e);
  }

  if (const QJsonValue modelValue = r.get(m, "model", "manifest"); modelValue.isObject()) {
    const QJsonObject o = modelValue.toObject();
    ModelReference ref;
    ref.fileName = r.str(o, "fileName", "model");
    ref.storage = r.str(o, "storage", "model");
    ref.assetId = r.str(o, "assetId", "model", false);
    ref.linkedPath = r.str(o, "linkedPath", "model", false);
    ref.sizeBytes = static_cast<std::uint64_t>(r.num(o, "sizeBytes", "model"));
    ref.sourceSizeBytes = static_cast<std::uint64_t>(r.num(o, "sourceSizeBytes", "model", false));
    ref.sha256 = r.str(o, "sha256", "model");
    ref.triangleCount = static_cast<std::uint64_t>(r.num(o, "triangleCount", "model", false));
    ref.sourceEncoding = r.str(o, "sourceEncoding", "model", false);
    ref.geometryVersion = r.str(o, "geometryVersion", "model", false);
    d.model = ref;
  } else if (!modelValue.isNull() && !modelValue.isUndefined()) {
    r.fail("manifest.model must be an object or null.");
  }

  const QJsonObject mold = r.object(m, "moldInputs", "manifest");
  d.mold.moldClearanceMm = r.num(mold, "moldClearanceMm", "moldInputs");
  d.mold.cavityClearanceMm = r.num(mold, "cavityClearanceMm", "moldInputs");
  for (const QJsonValue& value : r.array(mold, "cutFaces", "moldInputs")) {
    const QJsonObject f = value.toObject();
    CutFaceInput face;
    face.face = r.str(f, "face", "cutFace");
    face.enabled = r.boolean(f, "enabled", "cutFace");
    if (f.contains("position") && !f["position"].isNull()) face.position = r.num(f, "position", "cutFace");
    d.mold.cutFaces.push_back(face);
  }

  const QJsonObject sprues = r.object(m, "sprues", "manifest");
  d.nextSprueNumber = static_cast<int>(r.num(sprues, "nextNumber", "sprues"));
  for (const QJsonValue& value : r.array(sprues, "items", "sprues")) {
    const QJsonObject o = value.toObject();
    SprueRecord rec;
    rec.operationId = r.str(o, "operationId", "sprue");
    rec.creationOrder = static_cast<int>(r.num(o, "creationOrder", "sprue"));
    rec.position = r.vec3(o, "position", "sprue");
    rec.inwardDirection = r.vec3(o, "inwardDirection", "sprue");
    const QJsonObject profile = r.object(o, "profile", "sprue");
    rec.mainDiameterMm = r.num(profile, "mainDiameterMm", "sprue.profile");
    rec.entryNeckDiameterMm = r.num(profile, "entryNeckDiameterMm", "sprue.profile");
    rec.entryNeckLengthMm = r.num(profile, "entryNeckLengthMm", "sprue.profile");
    const QJsonObject design = r.object(o, "design", "sprue");
    rec.designSource = r.str(design, "source", "sprue.design");
    rec.mainSection = r.scalar(design, "mainSection", "sprue.design");
    rec.entryNeck = r.scalar(design, "entryNeckDiameter", "sprue.design");
    rec.entryNeckLength = r.scalar(design, "entryNeckLength", "sprue.design");
    for (const QJsonValue& w : r.array(design, "warnings", "sprue.design")) rec.designWarnings.push_back(s(w));
    const QJsonObject validation = r.object(o, "validation", "sprue");
    rec.validationStatus = r.str(validation, "status", "sprue.validation");
    rec.validationReasonCode = r.str(validation, "reasonCode", "sprue.validation", false);
    rec.validationMessage = r.str(validation, "message", "sprue.validation", false);
    d.sprues.push_back(rec);
  }

  const QJsonObject segmentation = r.object(m, "segmentation", "manifest");
  if (segmentation["printerVolumeMm"].isObject()) d.segmentation.printerVolumeMm = r.vec3(segmentation, "printerVolumeMm", "segmentation");
  for (const QJsonValue& value : r.array(segmentation, "extensions", "segmentation")) {
    const QJsonObject e = value.toObject();
    d.segmentation.extensions.emplace_back(r.str(e, "axis", "extension"), r.num(e, "coordinateMm", "extension"));
  }

  const QJsonObject view = r.object(m, "view", "manifest");
  d.view.theme = r.str(view, "theme", "view");
  d.view.showGrid = r.boolean(view, "showGrid", "view");
  d.view.showAxes = r.boolean(view, "showAxes", "view");
  d.view.showEdges = r.boolean(view, "showEdges", "view");
  d.view.moldOpacity = r.num(view, "moldOpacity", "view");
  if (view["camera"].isObject()) {
    const QJsonObject c = view["camera"].toObject();
    d.view.camera = CameraPose{r.vec3(c, "position", "view.camera"), r.vec3(c, "target", "view.camera")};
  }
  const QJsonObject workflow = r.object(m, "workflow", "manifest");
  d.workflow.segmentationPlanned = r.boolean(workflow, "segmentationPlanned", "workflow");
  d.workflow.segmentationExecuted = r.boolean(workflow, "segmentationExecuted", "workflow");
  d.workflow.moldGenerated = r.boolean(workflow, "moldGenerated", "workflow");

  if (m["autosave"].isObject()) d.autosaveOriginalPath = s(m["autosave"].toObject()["originalPath"]);

  // Unknown members (from a newer minor version) travel with the document and are written back unchanged.
  QJsonObject unknown;
  const auto& known = knownManifestMembers();
  for (auto it = m.begin(); it != m.end(); ++it)
    if (std::find(known.begin(), known.end(), it.key().toStdString()) == known.end()) unknown.insert(it.key(), it.value());
  if (!unknown.isEmpty()) d.preservedExtensionsJson = QJsonDocument(unknown).toJson(QJsonDocument::Compact).toStdString();

  out.error = r.error;
  return out;
}

}  // namespace craft::project
