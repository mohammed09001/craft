#pragma once

// Builds a MasterMoldRequest from a case of fixtures/reference/master-reference.json (shared by the wire-format and worker tests).

#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>

#include "master/MasterMoldStore.h"

namespace craft::testing {

inline QJsonObject masterFixtureCase(const QString& name) {
  QFile f(QStringLiteral(CRAFT_REFERENCE_FIXTURE_DIR "/master-reference.json"));
  if (!f.open(QIODevice::ReadOnly)) return {};
  for (const QJsonValue& v : QJsonDocument::fromJson(f.readAll()).object()["cases"].toArray())
    if (v.toObject()["name"].toString() == name) return v.toObject();
  return {};
}

inline MasterMoldRequest masterRequestFor(const QJsonObject& c) {
  const auto pointOf = [](const QJsonObject& o) { return Point3{o["x"].toDouble(), o["y"].toDouble(), o["z"].toDouble()}; };
  const QJsonObject input = c["input"].toObject();
  MasterSeedInput seedInput;
  MasterSeedGeometryInput& g = seedInput.sourcePartGeometry;
  g.modelId = "model-" + c["name"].toString().toStdString();
  for (const QJsonValue& v : input["positions"].toArray()) g.positions.push_back(v.toDouble());
  for (const QJsonValue& v : input["indices"].toArray()) g.indices.push_back(static_cast<std::uint32_t>(v.toInt()));
  const QJsonArray transform = input["transform"].toArray();
  for (int i = 0; i < 16; ++i) g.transform[static_cast<std::size_t>(i)] = transform[i].toDouble();
  Bounds3 local = emptyBounds();
  for (std::size_t i = 0; i < g.positions.size(); i += 3)
    for (int a = 0; a < 3; ++a) {
      local.min[a] = std::min(local.min[a], g.positions[i + static_cast<std::size_t>(a)]);
      local.max[a] = std::max(local.max[a], g.positions[i + static_cast<std::size_t>(a)]);
    }
  g.localBounds = local;
  g.geometryVersion = "geom-" + c["name"].toString().toStdString();
  if (input["printer"].isObject()) seedInput.printerBuildVolume = pointOf(input["printer"].toObject());
  seedInput.projectRevision = "rev-1";
  MasterMoldRequest request;
  request.operationId = "master-mold:1";
  request.generationVersion = 1;
  request.seed = buildMasterMoldSeedSnapshot(seedInput);
  return request;
}

}  // namespace craft::testing
