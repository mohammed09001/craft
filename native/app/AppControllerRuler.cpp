// The ground-plane ruler in the application controller: it follows the camera, and the label step with its hysteresis decides
// when the geometry is rebuilt (core/view/GroundPlaneRuler, a port of the reference's groundPlaneRuler.ts and
// createGroundPlaneRulerRuntime.ts). The axes and ticks become line geometry, the labels become camera-facing quads that
// carry a text texture (ViewportView.qml).

#include "AppController.h"
#include "RulerLabelImage.h"
#include "view/GroundPlaneRuler.h"

namespace craft::app {

void AppController::refreshRuler() {
  if (!ruler_.update(camera_.pose(), camera_.aspectRatio(), camera_.viewportHeight())) return;
  const RulerGeometry& g = ruler_.geometry();
  rulerAxes_.setBuffers(viewport::buildLineListBuffers(g.axes));
  rulerTicks_.setBuffers(viewport::buildLineListBuffers(g.ticks));

  rulerLabels_.clear();
  for (const RulerLabel& label : g.labels) {
    const QString text = QString::fromStdString(label.text);
    // The quad is the built-in 100 x 100 rectangle, so the scale is the wanted size over 100.
    rulerLabels_.append(QVariantMap{{"text", text},
                                    {"position", QVector3D(static_cast<float>(label.x), static_cast<float>(label.y), static_cast<float>(kRulerLabelZ))},
                                    {"scale", QVector3D(static_cast<float>(label.height * rulerLabelAspect(text) / 100.0), static_cast<float>(label.height / 100.0), 1.0f)},
                                    {"source", rulerLabelFileUrl(text)}});
  }
  emit rulerChanged();
}

QVariantMap AppController::rulerInfo() const {
  const RulerGeometry& g = ruler_.geometry();
  return {{"step", g.step},
          {"pixelsPerWorldUnit", g.pixelsPerWorldUnit},
          {"labelCount", static_cast<int>(g.labels.size())},
          {"tickVertexCount", static_cast<int>(g.ticks.size() / 3)},
          {"visible", showAxes_}};
}

}  // namespace craft::app
