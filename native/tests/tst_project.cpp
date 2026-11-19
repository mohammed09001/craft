// Craft project format: round trips, atomic save, integrity, version policy, migrations, linked models.

#include <QElapsedTimer>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QRandomGenerator>
#include <QTemporaryDir>
#include <QtTest>

#include <cmath>

#include "project/ProjectDocument.h"
#include "project/ProjectFile.h"
#include "project/ProjectJson.h"

using namespace craft::project;

namespace {

QByteArray fakeStl(int triangles = 12) {
  // Content is irrelevant to the container; it only needs a stable size and hash.
  QByteArray bytes(84 + triangles * 50, '\0');
  for (int i = 0; i < bytes.size(); ++i) bytes[i] = static_cast<char>((i * 31 + 7) & 0xFF);
  return bytes;
}

Document fullDocument(const QByteArray& stl) {
  Document d;
  d.projectId = "project-1234";
  d.createdAt = "2026-11-18T08:00:00.000Z";
  d.modifiedAt = "2026-11-18T09:30:00.123Z";
  d.appVersion = "0.1.0";
  ModelReference m;
  m.fileName = "bracket.stl";
  m.storage = "embedded";
  m.assetId = "model";
  m.sizeBytes = static_cast<std::uint64_t>(stl.size());
  m.sourceSizeBytes = 2831624;  // the imported ASCII file was larger than the embedded binary one
  m.sha256 = sha256Hex(stl);
  m.triangleCount = 12;
  m.sourceEncoding = "ASCII";
  m.geometryVersion = "part_mesh:abc123";
  d.model = m;
  d.mold.moldClearanceMm = 12.5;
  d.mold.cavityClearanceMm = 0.3;
  d.mold.cutFaces = {{"+x", true, 0.25}, {"-x", false, std::nullopt}, {"+z", true, std::nullopt}};
  SprueRecord s;
  s.operationId = "sprue:3";
  s.creationOrder = 1;
  s.position = {1.5, -2.25, 40.125};
  s.inwardDirection = {0, 0, -1};
  s.mainDiameterMm = 6.4;
  s.entryNeckDiameterMm = 3.2;
  s.entryNeckLengthMm = 5.1;
  s.designSource = "geometry-derived";
  s.mainSection = SprueScalarRecord{6.4, 5.9, "minimum-limit"};
  s.entryNeck = SprueScalarRecord{3.2, 3.2, "equation"};
  s.entryNeckLength = std::nullopt;
  s.designWarnings = {"first warning", "second \"quoted\" warning"};
  s.validationStatus = "resolved";
  s.validationReasonCode = "ok";
  s.validationMessage = "fine";
  d.sprues = {s};
  d.nextSprueNumber = 4;
  d.segmentation.printerVolumeMm = Vec3{220, 220, 250};
  d.segmentation.extensions = {{"x", 12.5}, {"z", -3.75}};
  d.view.theme = "light";
  d.view.showGrid = false;
  d.view.showAxes = true;
  d.view.showEdges = false;
  d.view.moldOpacity = 0.4;
  d.view.camera = CameraPose{{95, -120, 85}, {0, 0, 12}};
  d.workflow = {true, false, true};
  return d;
}

void expectSameDocument(const Document& a, const Document& b) {
  QCOMPARE(a.projectId, b.projectId);
  QCOMPARE(a.createdAt, b.createdAt);
  QCOMPARE(a.modifiedAt, b.modifiedAt);
  QCOMPARE(a.appVersion, b.appVersion);
  QCOMPARE(a.model.has_value(), b.model.has_value());
  if (a.model) QVERIFY(*a.model == *b.model);
  QVERIFY(a.mold == b.mold);
  QCOMPARE(a.sprues.size(), b.sprues.size());
  for (std::size_t i = 0; i < a.sprues.size(); ++i) QVERIFY(a.sprues[i] == b.sprues[i]);
  QCOMPARE(a.nextSprueNumber, b.nextSprueNumber);
  QVERIFY(a.segmentation == b.segmentation);
  QCOMPARE(a.view.theme, b.view.theme);
  QCOMPARE(a.view.showGrid, b.view.showGrid);
  QCOMPARE(a.view.showAxes, b.view.showAxes);
  QCOMPARE(a.view.showEdges, b.view.showEdges);
  QCOMPARE(a.view.moldOpacity, b.view.moldOpacity);
  QCOMPARE(a.view.camera.has_value(), b.view.camera.has_value());
  if (a.view.camera) QVERIFY(*a.view.camera == *b.view.camera);
  QVERIFY(a.workflow == b.workflow);
}

QByteArray readAll(const QString& path) {
  QFile f(path);
  return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray();
}
void writeAll(const QString& path, const QByteArray& bytes) {
  QFile f(path);
  QVERIFY(f.open(QIODevice::WriteOnly | QIODevice::Truncate));
  f.write(bytes);
}

/// Runs `fn` and returns the ProjectIoError code it throws ("" if it does not throw).
template <class F>
std::string errorCodeOf(F&& fn) {
  try {
    fn();
  } catch (const ProjectIoError& error) {
    return error.code();
  }
  return {};
}

}  // namespace

class ProjectTest : public QObject {
  Q_OBJECT

 private slots:
  // --- round trips ----------------------------------------------------------------------------------------------------------

  void roundTripPreservesEveryField() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    const Document d = fullDocument(stl);
    const QString path = dir.filePath("a.craft");
    writeProject(path, d, stl);
    const ProjectBundle bundle = readProject(path);
    expectSameDocument(d, bundle.document);
    QCOMPARE(bundle.embeddedModelBytes, stl);
    QCOMPARE(bundle.fileMajor, kFormatMajor);
    QVERIFY(!bundle.migrated);
    QVERIFY(bundle.warnings.empty());
    QCOMPARE(inputsFingerprint(d), inputsFingerprint(bundle.document));
  }

  void theImportedFilesSizeSurvivesAndItsAbsenceReadsAsZero() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    Document d = fullDocument(stl);
    writeProject(dir.filePath("a.craft"), d, stl);
    QCOMPARE(readProject(dir.filePath("a.craft")).document.model->sourceSizeBytes, std::uint64_t{2831624});
    d.model->sourceSizeBytes = 0;  // a file written before the field existed, or a linked model
    writeProject(dir.filePath("b.craft"), d, stl);
    QCOMPARE(readProject(dir.filePath("b.craft")).document.model->sourceSizeBytes, std::uint64_t{0});
  }

  void doublesRoundTripExactly() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    Document d = fullDocument(stl);
    d.mold.moldClearanceMm = 0.1 + 0.2;  // 0.30000000000000004
    d.view.moldOpacity = 1.0 / 3.0;
    d.sprues[0].position = {1e-9, 123456789.123456789, -0.0000123456789};
    writeProject(dir.filePath("d.craft"), d, stl);
    const Document back = readProject(dir.filePath("d.craft")).document;
    QCOMPARE(back.mold.moldClearanceMm, d.mold.moldClearanceMm);
    QCOMPARE(back.view.moldOpacity, d.view.moldOpacity);
    QVERIFY(back.sprues[0].position == d.sprues[0].position);
  }

  void projectWithoutAModelRoundTrips() {
    QTemporaryDir dir;
    Document d = fullDocument(fakeStl());
    d.model.reset();
    d.sprues.clear();
    d.workflow = {};
    writeProject(dir.filePath("empty.craft"), d, {});
    const ProjectBundle bundle = readProject(dir.filePath("empty.craft"));
    QVERIFY(!bundle.document.model.has_value());
    QVERIFY(bundle.embeddedModelBytes.isEmpty());
    expectSameDocument(d, bundle.document);
  }

  void unicodePathsAndNamesWork() {
    QTemporaryDir dir;
    QVERIFY(QDir(dir.path()).mkpath(QString::fromUtf8("Projekt \xC3\xA9\xC3\xA8 \xE6\x97\xA5\xE6\x9C\xAC")));
    const QString path = dir.filePath(QString::fromUtf8("Projekt \xC3\xA9\xC3\xA8 \xE6\x97\xA5\xE6\x9C\xAC/\xE9\x83\xA8\xE5\x93\x81.craft"));
    const QByteArray stl = fakeStl();
    Document d = fullDocument(stl);
    d.model->fileName = "teil \xC3\xA4\xC3\xB6.stl";
    writeProject(path, d, stl);
    QCOMPARE(readProject(path).document.model->fileName, d.model->fileName);
  }

  void aLargeEmbeddedModelRoundTripsQuickly() {
    QTemporaryDir dir;
    QByteArray stl(48 * 1024 * 1024, '\0');
    quint32* words = reinterpret_cast<quint32*>(stl.data());
    for (int i = 0; i < stl.size() / 4; ++i) words[i] = QRandomGenerator::global()->generate();
    Document d = fullDocument(stl);
    QElapsedTimer timer;
    timer.start();
    writeProject(dir.filePath("big.craft"), d, stl);
    const qint64 writeMs = timer.restart();
    const ProjectBundle bundle = readProject(dir.filePath("big.craft"));
    const qint64 readMs = timer.elapsed();
    QCOMPARE(bundle.embeddedModelBytes.size(), stl.size());
    QVERIFY(bundle.embeddedModelBytes == stl);
    qInfo() << "48 MiB project: write" << writeMs << "ms, read+verify" << readMs << "ms";
    QVERIFY2(writeMs < 15000 && readMs < 15000, "saving/loading a 48 MiB project should take seconds, not minutes");
    // The summary check never reads the asset.
    timer.restart();
    QVERIFY(isIntactProject(dir.filePath("big.craft")));
    QVERIFY2(timer.elapsed() < 1000, "inspectProject must not read the model data");
  }

  // --- atomic save and backup -------------------------------------------------------------------------------------------

  void savingTwiceKeepsOneBackupAndNoTemporaryFiles() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    Document first = fullDocument(stl);
    const QString path = dir.filePath("p.craft");
    writeProject(path, first, stl);
    QVERIFY(!QFileInfo::exists(path + ".bak"));  // nothing to back up on the first save
    Document second = first;
    second.mold.moldClearanceMm = 33;
    writeProject(path, second, stl);
    QVERIFY(QFileInfo::exists(path + ".bak"));
    QCOMPARE(readProject(path).document.mold.moldClearanceMm, 33.0);
    QCOMPARE(readProject(path + ".bak").document.mold.moldClearanceMm, 12.5);  // the previous good version
    // Only the project and its backup remain: no half-written temporary file.
    QStringList names = QDir(dir.path()).entryList(QDir::Files);
    names.sort();
    QCOMPARE(names, (QStringList{"p.craft", "p.craft.bak"}));
  }

  void aDamagedProjectNeverReplacesAGoodBackup() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    Document d = fullDocument(stl);
    const QString path = dir.filePath("p.craft");
    writeProject(path, d, stl);                                 // v1
    d.mold.moldClearanceMm = 20;
    writeProject(path, d, stl);                                 // v2, backup = v1 (12.5)
    QByteArray damaged = readAll(path);
    damaged[damaged.size() - 60] = static_cast<char>(damaged[damaged.size() - 60] ^ 0x55);  // inside the manifest
    writeAll(path, damaged);
    d.mold.moldClearanceMm = 30;
    writeProject(path, d, stl);                                 // v3: the damaged v2 must not become the backup
    QCOMPARE(readProject(path).document.mold.moldClearanceMm, 30.0);
    QCOMPARE(readProject(path + ".bak").document.mold.moldClearanceMm, 12.5);
  }

  void anInvalidDocumentIsRefusedAndTheExistingFileIsUntouched() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    Document good = fullDocument(stl);
    const QString path = dir.filePath("p.craft");
    writeProject(path, good, stl);
    const QByteArray before = readAll(path);

    Document bad = good;
    bad.mold.moldClearanceMm = std::nan("");
    QCOMPARE(errorCodeOf([&] { writeProject(path, bad, stl); }), std::string("project_invalid"));
    bad = good;
    QCOMPARE(errorCodeOf([&] { writeProject(path, bad, fakeStl(5)); }), std::string("project_invalid"));  // model bytes do not match the record
    QCOMPARE(errorCodeOf([&] { writeProject(path, bad, {}); }), std::string("project_invalid"));          // embedded model without data
    QCOMPARE(readAll(path), before);
    QVERIFY(!QFileInfo::exists(path + ".bak"));  // a refused save must not even rotate the backup
  }

  void aSaveToAnUnwritableLocationFailsCleanly() {
    const QByteArray stl = fakeStl();
    // A path whose "directory" is an existing file cannot be created.
    QTemporaryDir dir;
    writeAll(dir.filePath("not-a-dir"), "x");
    QCOMPARE(errorCodeOf([&] { writeProject(dir.filePath("not-a-dir/p.craft"), fullDocument(stl), stl); }), std::string("project_write_failed"));
  }

  // --- integrity -------------------------------------------------------------------------------------------------------------------

  void truncationIsDetectedAtEveryLength() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    writeProject(dir.filePath("p.craft"), fullDocument(stl), stl);
    const QByteArray whole = readAll(dir.filePath("p.craft"));
    for (const int cut : {1, 10, 48, 49, 200, static_cast<int>(whole.size() / 2), static_cast<int>(whole.size()) - 64, static_cast<int>(whole.size()) - 1}) {
      writeAll(dir.filePath("cut.craft"), whole.left(whole.size() - cut));
      const std::string code = errorCodeOf([&] { readProject(dir.filePath("cut.craft")); });
      QVERIFY2(code == "project_truncated" || code == "project_not_a_craft_file", qPrintable(QString("cut %1 -> %2").arg(cut).arg(QString::fromStdString(code))));
      QVERIFY(!isIntactProject(dir.filePath("cut.craft")));
    }
    writeAll(dir.filePath("empty.craft"), {});
    QVERIFY(!errorCodeOf([&] { readProject(dir.filePath("empty.craft")); }).empty());
  }

  void notACraftFileAndMissingFilesAreNamed() {
    QTemporaryDir dir;
    writeAll(dir.filePath("text.craft"), QByteArray("this is not a project file, just text that is long enough to pass the size check ........"));
    QCOMPARE(errorCodeOf([&] { readProject(dir.filePath("text.craft")); }), std::string("project_not_a_craft_file"));
    QCOMPARE(errorCodeOf([&] { readProject(dir.filePath("absent.craft")); }), std::string("project_not_found"));
  }

  void everyByteFlipInTheManifestOrModelIsCaught() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    writeProject(dir.filePath("p.craft"), fullDocument(stl), stl);
    const QByteArray whole = readAll(dir.filePath("p.craft"));
    const ProjectSummary summary = inspectProject(dir.filePath("p.craft"));
    Q_UNUSED(summary)
    // Flip one byte at many positions across the whole file (header, model, manifest, footer): none may read as the
    // original document without an error.
    int detected = 0, tried = 0;
    for (int pos = 0; pos < whole.size(); pos += 13) {
      QByteArray damaged = whole;
      damaged[pos] = static_cast<char>(damaged[pos] ^ 0x01);
      writeAll(dir.filePath("flip.craft"), damaged);
      ++tried;
      bool threw = false;
      try {
        const ProjectBundle b = readProject(dir.filePath("flip.craft"));
        // The only bytes that may change silently are the 32 reserved header bytes and the flags word.
        QVERIFY2(pos >= 12 && pos < 64 && !(pos >= 16 && pos < 32), qPrintable(QString("undetected flip at %1").arg(pos)));
        Q_UNUSED(b)
      } catch (const ProjectIoError&) {
        threw = true;
      }
      if (threw) ++detected;
    }
    QVERIFY(tried > 20);
    QVERIFY(detected >= tried - 6);  // at most the few reserved header bytes slip through
  }

  void modelDataDamageIsReportedAsAnAssetProblem() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    writeProject(dir.filePath("p.craft"), fullDocument(stl), stl);
    QByteArray damaged = readAll(dir.filePath("p.craft"));
    damaged[70] = static_cast<char>(damaged[70] ^ 0xFF);  // inside the embedded STL (starts at byte 64)
    writeAll(dir.filePath("p.craft"), damaged);
    QCOMPARE(errorCodeOf([&] { readProject(dir.filePath("p.craft")); }), std::string("project_asset_corrupt"));
    QVERIFY(isIntactProject(dir.filePath("p.craft")));  // the manifest is fine; the summary check does not read assets
  }

  void headerAndManifestMustAgreeOnTheVersion() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    writeProject(dir.filePath("p.craft"), fullDocument(stl), stl);
    QByteArray bytes = readAll(dir.filePath("p.craft"));
    bytes[10] = static_cast<char>(bytes[10] + 1);  // header minor changes, manifest still says 0
    writeAll(dir.filePath("p.craft"), bytes);
    QCOMPARE(errorCodeOf([&] { readProject(dir.filePath("p.craft")); }), std::string("project_corrupt"));
  }

  // --- version policy and migrations ----------------------------------------------------------------------------------------

  void aNewerMajorIsRefusedWithAClearMessage() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    WriteOptions options;
    options.overrideFormatMajor = kFormatMajor + 1;
    writeProject(dir.filePath("future.craft"), fullDocument(stl), stl, options);
    try {
      readProject(dir.filePath("future.craft"));
      QFAIL("a newer major must not be read");
    } catch (const ProjectIoError& error) {
      QCOMPARE(error.code(), std::string("project_unsupported_version"));
      QVERIFY(QString(error.what()).contains("newer version of Craft"));
    }
  }

  void aNewerMinorIsReadAndItsUnknownMembersSurviveASave() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    Document d = fullDocument(stl);
    d.preservedExtensionsJson = R"({"futureFeature":{"level":7,"tags":["a","b"]},"futureFlag":true})";
    WriteOptions options;
    options.overrideFormatMinor = kFormatMinor + 5;
    writeProject(dir.filePath("minor.craft"), d, stl, options);

    const ProjectBundle bundle = readProject(dir.filePath("minor.craft"));
    QCOMPARE(bundle.fileMinor, kFormatMinor + 5);
    QVERIFY(!bundle.warnings.empty());
    QVERIFY(QString::fromStdString(bundle.warnings.front()).contains("newer Craft"));
    expectSameDocument(d, bundle.document);
    QVERIFY(!bundle.document.preservedExtensionsJson.empty());

    // Saving with this build writes the current version and keeps the unknown members unchanged.
    writeProject(dir.filePath("resaved.craft"), bundle.document, bundle.embeddedModelBytes);
    const ProjectBundle again = readProject(dir.filePath("resaved.craft"));
    QCOMPARE(again.fileMinor, kFormatMinor);
    const QJsonObject kept = QJsonDocument::fromJson(QByteArray::fromStdString(again.document.preservedExtensionsJson)).object();
    QCOMPARE(kept["futureFeature"].toObject()["level"].toInt(), 7);
    QCOMPARE(kept["futureFeature"].toObject()["tags"].toArray().size(), 2);
    QVERIFY(kept["futureFlag"].toBool());
  }

  void anExtensionCanNeverShadowAKnownMember() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    Document d = fullDocument(stl);
    d.preservedExtensionsJson = R"({"units":"inch","schema":"evil","projectId":"hijacked"})";
    writeProject(dir.filePath("p.craft"), d, stl);
    const ProjectBundle bundle = readProject(dir.filePath("p.craft"));
    QCOMPARE(bundle.document.projectId, d.projectId);
  }

  void anOlderMajorWithoutAMigrationIsRefused() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    WriteOptions options;
    options.overrideFormatMajor = 0;
    writeProject(dir.filePath("old.craft"), fullDocument(stl), stl, options);
    try {
      readProject(dir.filePath("old.craft"));
      QFAIL("an older major without a migration must not be read");
    } catch (const ProjectIoError& error) {
      QCOMPARE(error.code(), std::string("project_unsupported_version"));
      QVERIFY(QString(error.what()).contains("no migration"));
    }
  }

  void migrationsRunInOrderAndAreReported() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    WriteOptions options;
    options.overrideFormatMajor = 0;
    writeProject(dir.filePath("old.craft"), fullDocument(stl), stl, options);

    // A stand-in for a real historical step: the legacy manifest kept the clearance one millimeter smaller.
    const std::vector<MigrationStep> chain{
        {0, 1, "legacy clearance convention", [](QJsonObject& manifest) {
           QJsonObject mold = manifest["moldInputs"].toObject();
           mold["moldClearanceMm"] = mold["moldClearanceMm"].toDouble() + 1;
           manifest["moldInputs"] = mold;
         }}};
    ReadOptions read;
    read.migrations = &chain;
    const ProjectBundle bundle = readProject(dir.filePath("old.craft"), read);
    QVERIFY(bundle.migrated);
    QCOMPARE(bundle.fileMajor, 0);
    QCOMPARE(bundle.document.mold.moldClearanceMm, 13.5);  // 12.5 + the migration's +1
    QVERIFY(!bundle.warnings.empty());
    QVERIFY(QString::fromStdString(bundle.warnings.front()).contains("legacy clearance convention"));
    // The file on disk is untouched; saving writes the current version.
    QCOMPARE(inspectProject(dir.filePath("old.craft")).formatMajor, 0);
    writeProject(dir.filePath("new.craft"), bundle.document, bundle.embeddedModelBytes);
    QCOMPARE(inspectProject(dir.filePath("new.craft")).formatMajor, kFormatMajor);
  }

  void aFailingMigrationIsReportedNotSwallowed() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    WriteOptions options;
    options.overrideFormatMajor = 0;
    writeProject(dir.filePath("old.craft"), fullDocument(stl), stl, options);
    const std::vector<MigrationStep> chain{{0, 1, "broken step", [](QJsonObject&) { throw std::runtime_error("cannot convert"); }}};
    ReadOptions read;
    read.migrations = &chain;
    try {
      readProject(dir.filePath("old.craft"), read);
      QFAIL("a failing migration must not yield a document");
    } catch (const ProjectIoError& error) {
      QCOMPARE(error.code(), std::string("project_migration_failed"));
      QVERIFY(QString(error.what()).contains("cannot convert"));
    }
  }

  // --- linked models ---------------------------------------------------------------------------------------------------------

  void aLinkedModelIsVerifiedAndMissingOrChangedFilesAreReported() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl(30);
    const QString stlPath = dir.filePath("outside.stl");
    writeAll(stlPath, stl);

    Document d = fullDocument(stl);
    d.model->storage = "linked";
    d.model->assetId.clear();
    d.model->linkedPath = stlPath.toStdString();
    writeProject(dir.filePath("linked.craft"), d, {});
    QVERIFY2(QFileInfo(dir.filePath("linked.craft")).size() < 8192, "a linked project must not embed the model");

    const ProjectBundle bundle = readProject(dir.filePath("linked.craft"));
    QVERIFY(bundle.embeddedModelBytes.isEmpty());
    QCOMPARE(loadLinkedModel(*bundle.document.model), stl);

    // Changed content (same size): detected by the hash.
    QByteArray changed = stl;
    changed[100] = static_cast<char>(changed[100] ^ 1);
    writeAll(stlPath, changed);
    QCOMPARE(errorCodeOf([&] { loadLinkedModel(*bundle.document.model); }), std::string("project_asset_changed"));
    // Changed size: detected without hashing.
    writeAll(stlPath, stl + "extra");
    QCOMPARE(errorCodeOf([&] { loadLinkedModel(*bundle.document.model); }), std::string("project_asset_changed"));
    // Missing, then relinked to the right file elsewhere.
    QVERIFY(QFile::remove(stlPath));
    QCOMPARE(errorCodeOf([&] { loadLinkedModel(*bundle.document.model); }), std::string("project_asset_missing"));
    const QString moved = dir.filePath("moved.stl");
    writeAll(moved, stl);
    QCOMPARE(loadLinkedModel(*bundle.document.model, moved), stl);
  }

  // --- document rules --------------------------------------------------------------------------------------------------------

  void validationNamesTheFirstProblem() {
    const QByteArray stl = fakeStl();
    const Document good = fullDocument(stl);
    QVERIFY(validateDocument(good).empty());
    const auto problem = [&](const std::function<void(Document&)>& mutate) {
      Document d = good;
      mutate(d);
      return QString::fromStdString(validateDocument(d));
    };
    QVERIFY(problem([](Document& d) { d.projectId.clear(); }).contains("projectId"));
    QVERIFY(problem([](Document& d) { d.model->sha256 = "xyz"; }).contains("sha256"));
    QVERIFY(problem([](Document& d) { d.model->storage = "cloud"; }).contains("storage"));
    QVERIFY(problem([](Document& d) { d.mold.moldClearanceMm = -1; }).contains("moldClearanceMm"));
    QVERIFY(problem([](Document& d) { d.mold.cutFaces[0].position = 1.5; }).contains("position"));
    QVERIFY(problem([](Document& d) { d.sprues[0].mainDiameterMm = 0; }).contains("profile"));
    QVERIFY(problem([](Document& d) { d.sprues[0].position.x = INFINITY; }).contains("non-finite"));
    QVERIFY(problem([](Document& d) { d.segmentation.printerVolumeMm = Vec3{1, 0, 1}; }).contains("printer volume"));
    QVERIFY(problem([](Document& d) { d.segmentation.extensions = {{"w", 1.0}}; }).contains("axis"));
    QVERIFY(problem([](Document& d) { d.view.theme = "neon"; }).contains("theme"));
    QVERIFY(problem([](Document& d) { d.view.moldOpacity = 2; }).contains("moldOpacity"));
  }

  void theDirtyFingerprintIgnoresTimestampsTheCameraAndDerivedFlags() {
    const QByteArray stl = fakeStl();
    const Document a = fullDocument(stl);
    Document b = a;
    b.modifiedAt = "2030-01-01T00:00:00.000Z";
    b.appVersion = "9.9.9";
    b.view.camera = CameraPose{{1, 2, 3}, {4, 5, 6}};
    QCOMPARE(inputsFingerprint(a), inputsFingerprint(b));
    b.mold.cavityClearanceMm += 0.1;
    QVERIFY(inputsFingerprint(a) != inputsFingerprint(b));
    Document c = a;
    c.sprues[0].position.z += 0.001;
    QVERIFY(inputsFingerprint(a) != inputsFingerprint(c));
    // Which stages were generated is derived state: it never makes a project "dirty".
    Document e = a;
    e.workflow.moldGenerated = false;
    QCOMPARE(inputsFingerprint(a), inputsFingerprint(e));
  }

  void inspectReturnsASummaryWithoutLoadingAssets() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl();
    const Document d = fullDocument(stl);
    writeProject(dir.filePath("p.craft"), d, stl);
    const ProjectSummary s = inspectProject(dir.filePath("p.craft"));
    QCOMPARE(s.projectId, d.projectId);
    QCOMPARE(s.modifiedAt, d.modifiedAt);
    QCOMPARE(s.modelFileName, d.model->fileName);
    QCOMPARE(s.formatMajor, kFormatMajor);
  }

  // --- cancellation and progress (IoControl) ---------------------------------------------------------------------------------------------------
  // A long save or open reports progress and can be stopped between chunks. A stopped save leaves the file exactly as it was, and no temporary file;
  // a stopped open returns nothing; progress never goes backwards and ends at 1 on success.
  void aCancelledSaveLeavesTheExistingFileAndNoTemporaryFile() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl(60000);   // 3 MB: several chunks at 256 KiB
    const Document doc = fullDocument(stl);
    const QString path = dir.filePath("p.craft");
    WriteOptions first;
    writeProject(path, doc, stl, first);
    QFile before(path);
    QVERIFY(before.open(QIODevice::ReadOnly));
    const QByteArray original = before.readAll();
    before.close();

    Document changed = doc;
    changed.mold.cavityClearanceMm = 4.5;
    for (int stopAfter : {0, 1, 4, 9}) {   // before anything, early, mid-model, late: every poll is a place where stopping is possible
      int polls = 0;
      WriteOptions options;
      options.control.chunkBytes = 256 * 1024;
      options.control.cancelled = [&] { return polls++ >= stopAfter; };
      try {
        writeProject(path, changed, stl, options);
        QFAIL(qPrintable(QStringLiteral("stopping after %1 polls did not stop the save").arg(stopAfter)));
      } catch (const ProjectIoError& error) {
        QCOMPARE(error.code(), std::string("project_cancelled"));
      }
      QFile now(path);
      QVERIFY(now.open(QIODevice::ReadOnly));
      QVERIFY2(now.readAll() == original, "a cancelled save must leave the file exactly as it was");
      for (const QString& name : QDir(dir.path()).entryList(QDir::Files | QDir::NoDotAndDotDot))   // the file, and its backup if the stop came after that step: no temporary file
        QVERIFY2(name == "p.craft" || name == "p.craft.bak", qPrintable("a cancelled save left " + name));
    }
  }

  // Each place where a save can stop is checked by itself: the stop is requested when the progress reaches a stage (while hashing, in the middle of the model, and
  // after its last chunk, where only the check before the commit is left), and the save must stop within a chunk or two, leaving the file as it was.
  void aSaveStopsPromptlyInEveryStage() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl(60000);
    const Document doc = fullDocument(stl);
    const QString path = dir.filePath("p.craft");
    writeProject(path, doc, stl);
    QFile original(path);
    QVERIFY(original.open(QIODevice::ReadOnly));
    const QByteArray before = original.readAll();
    original.close();
    Document changed = doc;
    changed.mold.cavityClearanceMm = 4.5;

    struct Stage { const char* name; double at; double slack; };
    for (const Stage& stage : {Stage{"while hashing the model", 0.05, 0.04}, Stage{"in the middle of writing", 0.5, 0.07}, Stage{"after the last chunk, before the commit", 0.95, 0.001}}) {
      bool stopRequested = false;
      double highest = 0;
      WriteOptions options;
      options.control.chunkBytes = 256 * 1024;
      options.control.progress = [&](double f) {
        highest = std::max(highest, f);
        if (f >= stage.at) stopRequested = true;
      };
      options.control.cancelled = [&] { return stopRequested; };
      try {
        writeProject(path, changed, stl, options);
        QFAIL(stage.name);   // it finished: the stop was never honoured
      } catch (const ProjectIoError& error) {
        QCOMPARE(error.code(), std::string("project_cancelled"));
      }
      QVERIFY2(highest <= stage.at + stage.slack, qPrintable(QStringLiteral("%1: the save went on to %2 after the stop at %3").arg(stage.name).arg(highest).arg(stage.at)));
      QFile now(path);
      QVERIFY(now.open(QIODevice::ReadOnly));
      QVERIFY2(now.readAll() == before, stage.name);
    }
  }

  void aSaveReportsProgressThatNeverGoesBackwardsAndEndsAtOne() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl(60000);
    std::vector<double> seen;
    WriteOptions options;
    options.control.chunkBytes = 256 * 1024;
    options.control.progress = [&](double f) { seen.push_back(f); };
    writeProject(dir.filePath("p.craft"), fullDocument(stl), stl, options);
    QVERIFY(seen.size() > 10);   // hashing and writing both report in chunks
    for (std::size_t i = 1; i < seen.size(); ++i) QVERIFY2(seen[i] >= seen[i - 1], "progress went backwards");
    QVERIFY(seen.front() > 0 && seen.front() < 0.5);
    QCOMPARE(seen.back(), 1.0);
    QVERIFY(readProject(dir.filePath("p.craft")).embeddedModelBytes == stl);   // and the result is the same file as without a control
  }

  void aCancelledOpenReturnsNothingAndAnOpenReportsProgress() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl(60000);
    writeProject(dir.filePath("p.craft"), fullDocument(stl), stl);

    std::vector<double> seen;
    ReadOptions watch;
    watch.control.chunkBytes = 256 * 1024;
    watch.control.progress = [&](double f) { seen.push_back(f); };
    const ProjectBundle bundle = readProject(dir.filePath("p.craft"), watch);
    QVERIFY(bundle.embeddedModelBytes == stl);
    QVERIFY(seen.size() > 8);
    for (std::size_t i = 1; i < seen.size(); ++i) QVERIFY2(seen[i] >= seen[i - 1], "progress went backwards");
    QCOMPARE(seen.back(), 1.0);

    for (int stopAfter : {0, 1, 5, 10}) {
      int polls = 0;
      ReadOptions options;
      options.control.chunkBytes = 256 * 1024;
      options.control.cancelled = [&] { return polls++ >= stopAfter; };
      try {
        readProject(dir.filePath("p.craft"), options);
        QFAIL(qPrintable(QStringLiteral("stopping after %1 polls did not stop the open").arg(stopAfter)));
      } catch (const ProjectIoError& error) {
        QCOMPARE(error.code(), std::string("project_cancelled"));
      }
    }
  }

  void aLinkedModelLoadsInChunksAndCanBeCancelled() {
    QTemporaryDir dir;
    const QByteArray stl = fakeStl(60000);
    QFile model(dir.filePath("linked.stl"));
    QVERIFY(model.open(QIODevice::WriteOnly));
    model.write(stl);
    model.close();
    ModelReference ref;
    ref.fileName = "linked.stl";
    ref.storage = "linked";
    ref.linkedPath = dir.filePath("linked.stl").toStdString();
    ref.sizeBytes = static_cast<std::uint64_t>(stl.size());
    ref.sha256 = sha256Hex(stl);
    IoControl control;
    control.chunkBytes = 256 * 1024;
    QVERIFY(loadLinkedModel(ref, {}, control) == stl);
    int polls = 0;
    control.cancelled = [&] { return polls++ >= 3; };
    try {
      loadLinkedModel(ref, {}, control);
      QFAIL("the load was not stopped");
    } catch (const ProjectIoError& error) {
      QCOMPARE(error.code(), std::string("project_cancelled"));
    }
    ref.sha256 = std::string(64, '0');   // a changed file is still reported as changed, with a control in place
    try {
      loadLinkedModel(ref, {}, IoControl{});
      QFAIL("a changed linked model was accepted");
    } catch (const ProjectIoError& error) {
      QCOMPARE(error.code(), std::string("project_asset_changed"));
    }
  }
};

QTEST_APPLESS_MAIN(ProjectTest)
#include "tst_project.moc"
