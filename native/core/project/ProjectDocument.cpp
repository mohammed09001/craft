#include "project/ProjectDocument.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <sstream>

namespace craft::project {

namespace {

bool finite(double v) { return std::isfinite(v); }
bool finite(const Vec3& v) { return finite(v.x) && finite(v.y) && finite(v.z); }

bool inSet(const std::string& value, std::initializer_list<const char*> allowed) {
  return std::any_of(allowed.begin(), allowed.end(), [&](const char* a) { return value == a; });
}

bool isHexSha256(const std::string& s) {
  return s.size() == 64 && std::all_of(s.begin(), s.end(), [](unsigned char c) { return std::isdigit(c) || (c >= 'a' && c <= 'f'); });
}

}  // namespace

std::string validateDocument(const Document& d) {
  if (d.projectId.empty()) return "projectId is empty.";
  if (d.model) {
    const ModelReference& m = *d.model;
    if (!inSet(m.storage, {"embedded", "linked"})) return "model.storage must be \"embedded\" or \"linked\".";
    if (m.fileName.empty()) return "model.fileName is empty.";
    if (!isHexSha256(m.sha256)) return "model.sha256 is not a lowercase hex SHA-256.";
    if (m.storage == "embedded" && m.assetId.empty()) return "an embedded model needs an assetId.";
    if (m.storage == "linked" && m.linkedPath.empty()) return "a linked model needs a linkedPath.";
  }
  if (!finite(d.mold.moldClearanceMm) || d.mold.moldClearanceMm < 0) return "mold.moldClearanceMm must be finite and non-negative.";
  if (!finite(d.mold.cavityClearanceMm) || d.mold.cavityClearanceMm < 0) return "mold.cavityClearanceMm must be finite and non-negative.";
  for (const CutFaceInput& f : d.mold.cutFaces) {
    if (f.face.empty()) return "a cut face has no name.";
    if (f.position && (!finite(*f.position) || *f.position < 0 || *f.position > 1)) return "cut face position must be within 0..1.";
  }
  for (const SprueRecord& s : d.sprues) {
    if (s.operationId.empty()) return "a sprue has no operationId.";
    if (!finite(s.position) || !finite(s.inwardDirection)) return "sprue " + s.operationId + " has a non-finite position or direction.";
    if (!(finite(s.mainDiameterMm) && s.mainDiameterMm > 0 && finite(s.entryNeckDiameterMm) && s.entryNeckDiameterMm > 0 && finite(s.entryNeckLengthMm) &&
          s.entryNeckLengthMm > 0))
      return "sprue " + s.operationId + " has a non-positive profile dimension.";
    if (!inSet(s.designSource, {"geometry-derived", "fallback"})) return "sprue " + s.operationId + " has an unknown design source.";
    if (!inSet(s.validationStatus, {"pending", "resolved", "invalid"})) return "sprue " + s.operationId + " has an unknown validation status.";
  }
  if (d.nextSprueNumber < 1) return "nextSprueNumber must be at least 1.";
  if (d.segmentation.printerVolumeMm) {
    const Vec3& v = *d.segmentation.printerVolumeMm;
    if (!(finite(v) && v.x > 0 && v.y > 0 && v.z > 0)) return "the printer volume must be finite and positive.";
  }
  for (const auto& [axis, coordinate] : d.segmentation.extensions) {
    if (!inSet(axis, {"x", "y", "z"})) return "a segmentation extension has an unknown axis.";
    if (!finite(coordinate)) return "a segmentation extension coordinate is not finite.";
  }
  if (!inSet(d.view.theme, {"dark", "light"})) return "view.theme must be \"dark\" or \"light\".";
  if (!finite(d.view.moldOpacity) || d.view.moldOpacity < 0 || d.view.moldOpacity > 1) return "view.moldOpacity must be within 0..1.";
  if (d.view.camera && !(finite(d.view.camera->position) && finite(d.view.camera->target))) return "the camera pose is not finite.";
  return {};
}

std::string inputsFingerprint(const Document& d) {
  std::ostringstream out;
  out.precision(17);
  const auto vec = [&](const Vec3& v) { out << v.x << ',' << v.y << ',' << v.z << ';'; };
  if (d.model) out << "M:" << d.model->fileName << '|' << d.model->storage << '|' << d.model->sha256 << '|' << d.model->linkedPath << ';';
  out << "C:" << d.mold.moldClearanceMm << ',' << d.mold.cavityClearanceMm << ';';
  for (const auto& f : d.mold.cutFaces) out << f.face << ':' << f.enabled << ':' << (f.position ? *f.position : -1.0) << ';';
  for (const auto& s : d.sprues) {
    out << "S:" << s.operationId << '|' << s.creationOrder << '|';
    vec(s.position);
    vec(s.inwardDirection);
    out << s.mainDiameterMm << ',' << s.entryNeckDiameterMm << ',' << s.entryNeckLengthMm << ';';
  }
  out << "N:" << d.nextSprueNumber << ';';
  if (d.segmentation.printerVolumeMm) vec(*d.segmentation.printerVolumeMm);
  for (const auto& [axis, coordinate] : d.segmentation.extensions) out << "E:" << axis << coordinate << ';';
  out << "V:" << d.view.theme << d.view.showGrid << d.view.showAxes << d.view.showEdges << d.view.moldOpacity << ';';
  return out.str();
}

}  // namespace craft::project
