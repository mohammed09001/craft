#include "CrashDrill.h"

#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTimer>

#include "AppController.h"
#include "AppPaths.h"

namespace craft::app {

struct CrashDrill::Impl {
  AppController& app;
  CrashDrillOptions options;
  QTimer editTimer, readyTimer, probeTimer;
  int step = 0;
  bool announced = false;
  QString error;
  bool recoverStarted = false;
  QJsonArray offersSeen;  // read before the recovery: the autosave of the project that is open is no longer offered
  Impl(AppController& a, CrashDrillOptions o) : app(a), options(std::move(o)) {}

  void writeJson(const QJsonObject& object) const {
    QFile file(options.file);
    if (file.open(QIODevice::WriteOnly | QIODevice::Truncate)) file.write(QJsonDocument(object).toJson());
  }

  QJsonArray folderListing() const {
    QJsonArray files;
    const QDir dir(AppPaths::autosaveDirectory());
    for (const QFileInfo& info : dir.entryInfoList(QDir::Files, QDir::Name))
      files.append(QJsonObject{{"name", info.fileName()}, {"size", static_cast<double>(info.size())}});
    return files;
  }

  // --- victim ---------------------------------------------------------------------------------------------------------------
  void startVictim() {
    QObject::connect(&app, &AppController::modelChanged, &editTimer, [this] {
      if (app.modelPhase() != QLatin1String("ready") || editTimer.isActive()) return;
      app.setAutosaveIntervalMs(80);
      editTimer.start(25);
      readyTimer.start(40);
    });
    QObject::connect(&editTimer, &QTimer::timeout, &editTimer, [this] { app.setCavityClearanceMm(crashDrillClearanceMm(step++)); });
    QObject::connect(&readyTimer, &QTimer::timeout, &readyTimer, [this] {
      if (announced) return;
      if (QDir(AppPaths::autosaveDirectory()).entryList({QStringLiteral("*.craft")}, QDir::Files).isEmpty()) return;
      announced = true;
      writeJson({{"ready", true}, {"pid", static_cast<double>(QCoreApplication::applicationPid())},
                 {"autosaveDirectory", AppPaths::autosaveDirectory()}});
    });
    QObject::connect(&app, &AppController::errorOccurred, &editTimer, [this](const QString& title, const QString& message, const QString&) {
      writeJson({{"ready", false}, {"error", title + QStringLiteral(": ") + message}});
    });
    app.importStlFile(options.importPath);
  }

  // --- probe ----------------------------------------------------------------------------------------------------------------
  void finishProbe() {
    QJsonObject out;
    out.insert("error", error);
    out.insert("files", folderListing());
    out.insert("offers", offersSeen);
    out.insert("recovered", recoverStarted && error.isEmpty() && app.model().has_value());
    if (app.model()) {
      out.insert("modelName", app.model()->fileName);
      out.insert("modelTriangles", static_cast<double>(app.model()->sourceSoup ? app.model()->sourceSoup->positions.size() / 9 : 0));
      out.insert("cavityClearanceMm", app.cavityClearanceMm());
    }
    out.insert("projectRecoveredFrom", app.project().value("recoveredFrom").toString());
    writeJson(out);
    QCoreApplication::exit(0);
  }

  void startProbe() {
    QObject::connect(&app, &AppController::errorOccurred, &probeTimer, [this](const QString& title, const QString& message, const QString& code) {
      error = title + QStringLiteral(": ") + message + QStringLiteral(" (") + code + QStringLiteral(")");
    });
    // The controller scans the autosave folder as it starts; give it a moment, then open the first offer as the Recover dialog does.
    QTimer::singleShot(400, &probeTimer, [this] {
      const QVariantList items = app.recovery().value("items").toList();
      for (const QVariant& item : items)
        offersSeen.append(QJsonObject{{"name", item.toMap().value("name").toString()}, {"path", item.toMap().value("path").toString()}});
      if (items.isEmpty()) return finishProbe();
      recoverStarted = true;
      app.recoverProject(items.first().toMap().value("path").toString());
      auto* poll = &probeTimer;
      QObject::connect(poll, &QTimer::timeout, poll, [this] {
        const bool opened = app.modelPhase() == QLatin1String("ready") && !app.project().value("opening").toBool();
        if (opened || !error.isEmpty()) {
          probeTimer.stop();
          finishProbe();
        }
      });
      probeTimer.start(50);
    });
    QTimer::singleShot(60000, &probeTimer, [this] {
      error = QStringLiteral("the probe timed out");
      finishProbe();
    });
  }
};

CrashDrill::CrashDrill(AppController& app, CrashDrillOptions options) : impl_(new Impl(app, std::move(options))) {}
CrashDrill::~CrashDrill() { delete impl_; }

void CrashDrill::start() {
  if (impl_->options.role == DrillRole::Victim) impl_->startVictim();
  else impl_->startProbe();
}

}  // namespace craft::app
