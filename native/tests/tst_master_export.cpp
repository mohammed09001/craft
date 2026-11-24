// Master export: planning (exactly the two masters, under which names), the writer (files, manifest, verification, never overwriting, all-or-nothing)
// and the failure paths.

#include <QtTest/QtTest>

#include <QCryptographicHash>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>

#include <algorithm>
#include <filesystem>
#include <fstream>

#include "MasterPlanFixtures.h"
#include "stl/Stl.h"
#include "threemf/ThreeMf.h"
#include "tooling/MasterToolingExport.h"

using namespace craft;
using namespace craft::toolingexport;

namespace {

namespace fs = std::filesystem;

MasterExportSource currentSource(std::shared_ptr<const MasterMoldPlan> plan = craft::testing::sharedValidMasterPlan()) { return {"current", std::move(plan), {}}; }

std::string sha256OfFile(const fs::path& path) {
  QFile file(QString::fromStdWString(path.wstring()));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QCryptographicHash::hash(file.readAll(), QCryptographicHash::Sha256).toHex().toStdString();
}

QJsonObject readManifest(const fs::path& path) {
  QFile file(QString::fromStdWString(path.wstring()));
  if (!file.open(QIODevice::ReadOnly)) return {};
  return QJsonDocument::fromJson(file.readAll()).object();
}

std::vector<std::string> entries(const fs::path& folder) {
  std::vector<std::string> names;
  for (const auto& e : fs::directory_iterator(folder)) names.push_back(e.path().filename().string());
  std::sort(names.begin(), names.end());
  return names;
}

MasterExportOptions optionsFor(const std::string& model) {
  MasterExportOptions o;
  o.modelName = model;
  o.appVersion = "0.1.0-test";
  o.exportedAtUtc = "2026-01-02T03:04:05Z";
  o.generationVersion = 3;
  return o;
}

}  // namespace

class MasterExportTest : public QObject {
  Q_OBJECT

 private slots:
  void sanitizeKeepsNamesUsableOnEveryFileSystem() {
    QCOMPARE(sanitizeFileComponent("Case A (+Z)", "x"), std::string("Case_A_(+Z)"));
    QCOMPARE(sanitizeFileComponent("a<b>c:d\"e/f\\g|h?i*j", "x"), std::string("a_b_c_d_e_f_g_h_i_j"));
    QCOMPARE(sanitizeFileComponent("  spaced   out  ", "x"), std::string("spaced_out"));
    QCOMPARE(sanitizeFileComponent("tab\tnew\nline\x01zero", "x"), std::string("tab_new_line_zero"));
    QCOMPARE(sanitizeFileComponent("..hidden..", "x"), std::string("hidden"));
    QCOMPARE(sanitizeFileComponent("", "fallback"), std::string("fallback"));
    QCOMPARE(sanitizeFileComponent("***", "fallback"), std::string("fallback"));
    const std::string arabic = "\xD9\x82\xD8\xA7\xD9\x84\xD8\xA8";  // 4 letters, 2 bytes each
    QCOMPARE(sanitizeFileComponent(arabic, "x"), arabic);
    QCOMPARE(sanitizeFileComponent(arabic, "x", 7), arabic.substr(0, 6));  // truncation never splits a UTF-8 sequence
    QCOMPARE(sanitizeFileComponent(std::string(200, 'a'), "x", 60).size(), std::size_t{60});
  }

  void planExportsExactlyTheTwoMasters() {
    const MasterExportPlan plan = planMasterToolingExport(currentSource(), "bracket.stl");
    QCOMPARE(plan.files.size(), std::size_t{2});
    QCOMPARE(plan.files[0].fileName, std::string("bracket_master_A.stl"));
    QCOMPARE(plan.files[1].fileName, std::string("bracket_master_B.stl"));
    QCOMPARE(plan.files[0].toolName, std::string("Master A"));
    QVERIFY(plan.excluded.empty());
    QVERIFY(plan.warnings.empty());
  }
  void planNeverIncludesTheVirtualHalves() {
    for (const PlannedFile& f : planMasterToolingExport(currentSource(), "m.stl").files) QVERIFY(f.fileName.find("half") == std::string::npos && f.fileName.find("Working") == std::string::npos);
  }
  void planExplainsAStaleOrBlockedOrMissingResult() {
    const MasterExportPlan stale = planMasterToolingExport({"stale", craft::testing::sharedValidMasterPlan(), {}}, "m.stl");
    QVERIFY(stale.files.empty());
    QVERIFY(stale.excluded.at(0).reason.find("regenerate") != std::string::npos);
    const MasterExportPlan blocked = planMasterToolingExport({"blocked", nullptr, "No flat seam."}, "m.stl");
    QVERIFY(blocked.files.empty());
    QCOMPARE(blocked.excluded.at(0).reason, std::string("No flat seam."));
    QVERIFY(planMasterToolingExport({"unavailable", nullptr, {}}, "m.stl").files.empty());
    QVERIFY(planMasterToolingExport({"current", nullptr, {}}, "m.stl").files.empty());
  }
  void aMasterWithoutGeometryBlocksTheWholePair() {
    auto plan = std::make_shared<MasterMoldPlan>(craft::testing::validMasterPlan());
    plan->masters[1].mesh = {};
    const MasterExportPlan p = planMasterToolingExport(currentSource(plan), "m.stl");
    QVERIFY(p.files.empty());  // a Master Mold is a pair
    QVERIFY(p.excluded.size() >= 2);
  }
  void planCarriesThePlansWarningsAndFlagsAnOpenMaster() {
    auto plan = std::make_shared<MasterMoldPlan>(craft::testing::validMasterPlan());
    plan->warnings = {"zero-draft faces"};
    plan->masters[0].facts.watertight = false;
    const MasterExportPlan p = planMasterToolingExport(currentSource(plan), "m.stl");
    QCOMPARE(p.files.size(), std::size_t{2});
    QVERIFY(std::any_of(p.warnings.begin(), p.warnings.end(), [](const std::string& w) { return w.find("Master A: not a single closed") != std::string::npos; }));
    QVERIFY(std::find(p.warnings.begin(), p.warnings.end(), "zero-draft faces") != p.warnings.end());
  }

  void writesVerifiedFilesAndAManifest() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const MasterExportPlan plan = planMasterToolingExport(currentSource(craft::testing::sharedValidMasterPlan()), "bracket.stl");
    const fs::path parent = fs::path(dir.path().toStdWString()) / "out";  // does not exist yet
    const MasterExportResult result = writeMasterToolingExport(plan, parent, optionsFor("bracket.stl"));

    QCOMPARE(result.folder.filename().string(), std::string("bracket_master_tooling"));
    QCOMPARE(result.files.size(), std::size_t{2});
    QCOMPARE(entries(result.folder), (std::vector<std::string>{"bracket_master_A.stl", "bracket_master_B.stl", "manifest.json"}));
    QVERIFY(!fs::exists(fs::path(result.folder) += ".craft-export-tmp"));

    const stl::ReadResult back = stl::readFile(result.files[1]);
    QCOMPARE(back.facetCount, std::size_t{12});

    const QJsonObject manifest = readManifest(result.manifest);
    QCOMPARE(manifest.value("format").toString(), QStringLiteral("craft.master-tooling-export"));
    QCOMPARE(manifest.value("formatVersion").toInt(), 2);
    QCOMPARE(manifest.value("units").toString(), QStringLiteral("millimeters"));
    QCOMPARE(manifest.value("source").toObject().value("model").toString(), QStringLiteral("bracket.stl"));
    QCOMPARE(manifest.value("source").toObject().value("generationVersion").toInt(), 3);
    QCOMPARE(manifest.value("fingerprint").toString(), QStringLiteral("plan-fp"));
    QCOMPARE(manifest.value("releaseChecks").toArray().size(), 4);
    QCOMPARE(manifest.value("residualUncertainty").toArray().size(), 1);
    QCOMPARE(manifest.value("materialEstimates").toArray().size(), 2);
    const QJsonArray halves = manifest.value("virtualWorkingHalves").toArray();
    QCOMPARE(halves.size(), 2);
    QVERIFY(!halves.at(0).toObject().value("exported").toBool());

    const QJsonArray masters = manifest.value("masters").toArray();
    QCOMPARE(masters.size(), 2);
    for (int i = 0; i < masters.size(); ++i) {
      const QJsonObject m = masters.at(i).toObject();
      const fs::path file = result.folder / m.value("file").toString().toStdString();
      QVERIFY(fs::exists(file));
      QCOMPARE(QString::fromStdString(sha256OfFile(file)), m.value("sha256").toString());
      QCOMPARE(static_cast<qint64>(fs::file_size(file)), static_cast<qint64>(m.value("bytes").toDouble()));
      QCOMPARE(m.value("triangleCount").toInt(), 12);
      QVERIFY(m.value("watertight").toBool());
      QCOMPARE(m.value("printFromModel").toArray().size(), 16);
    }
    QCOMPARE(masters.at(0).toObject().value("name").toString(), QStringLiteral("Master A"));
    QCOMPARE(static_cast<std::uintmax_t>(result.totalBytes), fs::file_size(result.files[0]) + fs::file_size(result.files[1]) + fs::file_size(result.manifest));
  }

  void writesOneVerified3mfWithBothMastersSideBySide() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    MasterExportOptions options = optionsFor("bracket.stl");
    options.write3mf = true;
    const MasterExportResult result = writeMasterToolingExport(planMasterToolingExport(currentSource(), "bracket.stl"), fs::path(dir.path().toStdWString()) / "out", options);

    QCOMPARE(result.files.size(), std::size_t{2});
    QCOMPARE(result.threeMf.filename().string(), std::string("bracket_master_tooling.3mf"));
    const threemf::Report report = threemf::validateFile(result.threeMf);
    QVERIFY2(report.ok, report.problem.c_str());
    QCOMPARE(report.unit, std::string("millimeter"));
    QCOMPARE(report.objects.size(), std::size_t{2});
    QCOMPARE(report.objects[0].name, std::string("Master A"));
    QCOMPARE(report.objects[1].name, std::string("Master B"));
    for (const threemf::ObjectReport& o : report.objects) {
      QCOMPARE(o.triangles, std::size_t{12});
      QVERIFY(o.closedTwoManifold);
      QCOMPARE(o.volume, 1000.0);
    }
    QVERIFY2(report.objects[1].bounds[0] >= report.objects[0].bounds[3], "Master B must start beyond Master A on the plate");
    const QJsonObject threeMf = readManifest(result.manifest).value("threeMf").toObject();
    QCOMPARE(QString::fromStdString(sha256OfFile(result.threeMf)), threeMf.value("sha256").toString());
    QCOMPARE(threeMf.value("objects").toArray().size(), 2);
    // The STL files stay in each master's own frame: both start at x = 0.
    QCOMPARE(stl::readFile(result.files[1]).soup.positions[0] >= 0.0f, true);
  }

  void noThreeMfIsWrittenUnlessAskedFor() {
    QTemporaryDir dir;
    const MasterExportResult result = writeMasterToolingExport(planMasterToolingExport(currentSource(), "bracket.stl"), fs::path(dir.path().toStdWString()), optionsFor("bracket.stl"));
    QVERIFY(result.threeMf.empty());
    QCOMPARE(entries(result.folder), (std::vector<std::string>{"bracket_master_A.stl", "bracket_master_B.stl", "manifest.json"}));
    QVERIFY(!readManifest(result.manifest).contains("threeMf"));
  }

  void neverOverwritesAnEarlierExport() {
    QTemporaryDir dir;
    const MasterExportPlan plan = planMasterToolingExport(currentSource(), "m.stl");
    const fs::path parent = fs::path(dir.path().toStdWString());
    const MasterExportResult first = writeMasterToolingExport(plan, parent, optionsFor("m.stl"));
    const std::string firstHash = sha256OfFile(first.files[0]);
    { std::ofstream(parent / "notes.txt") << "keep me"; }
    const MasterExportResult second = writeMasterToolingExport(plan, parent, optionsFor("m.stl"));
    const MasterExportResult third = writeMasterToolingExport(plan, parent, optionsFor("m.stl"));
    QCOMPARE(first.folder.filename().string(), std::string("m_master_tooling"));
    QCOMPARE(second.folder.filename().string(), std::string("m_master_tooling_2"));
    QCOMPARE(third.folder.filename().string(), std::string("m_master_tooling_3"));
    QCOMPARE(sha256OfFile(first.files[0]), firstHash);
    QVERIFY(fs::exists(parent / "notes.txt"));
    QCOMPARE(entries(parent), (std::vector<std::string>{"m_master_tooling", "m_master_tooling_2", "m_master_tooling_3", "notes.txt"}));
  }

  void unicodeFolderAndModelNamesWork() {
    QTemporaryDir dir;
    const fs::path parent = fs::path(dir.path().toStdWString()) / std::u8string(u8"تصدير-部品-Müller");
    const MasterExportPlan plan = planMasterToolingExport(currentSource(), "جزء.stl");
    const MasterExportResult result = writeMasterToolingExport(plan, parent, optionsFor("جزء.stl"));
    QVERIFY(fs::exists(result.files[0]));
    QVERIFY(fs::exists(result.manifest));
    QCOMPARE(stl::readFile(result.files[0]).facetCount, std::size_t{12});
  }

  void nothingToExportFailsWithTheReasons() {
    QTemporaryDir dir;
    const fs::path parent = fs::path(dir.path().toStdWString());
    try {
      writeMasterToolingExport(planMasterToolingExport({"stale", craft::testing::sharedValidMasterPlan(), {}}, "m.stl"), parent, optionsFor("m.stl"));
      QFAIL("expected master_export_nothing");
    } catch (const CodedError& e) {
      QCOMPARE(e.code(), std::string("master_export_nothing"));
      QVERIFY(std::string(e.what()).find("regenerate") != std::string::npos);
    }
    QVERIFY(entries(parent).empty());  // not even an empty folder
    try {
      writeMasterToolingExport(planMasterToolingExport({"unavailable", nullptr, {}}, "m.stl"), parent, optionsFor("m.stl"));
      QFAIL("expected master_export_nothing");
    } catch (const CodedError& e) {
      QVERIFY(std::string(e.what()).find("Generate the Master Mold first") != std::string::npos);
    }
  }

  void aFailureHalfWayLeavesNothingBehind() {
    QTemporaryDir dir;
    MasterExportPlan plan = planMasterToolingExport(currentSource(), "m.stl");
    plan.files[1].fileName = "missing-subfolder/two.stl";  // the second write cannot succeed
    const fs::path parent = fs::path(dir.path().toStdWString());
    try {
      writeMasterToolingExport(plan, parent, optionsFor("m.stl"));
      QFAIL("expected master_export_write_failed");
    } catch (const CodedError& e) {
      QCOMPARE(e.code(), std::string("master_export_write_failed"));
    }
    QVERIFY2(entries(parent).empty(), "neither the finished folder nor the temporary one may remain");
  }

  void anUncreatableFolderFailsCleanly() {
    QTemporaryDir dir;
    const fs::path blocker = fs::path(dir.path().toStdWString()) / "afile";
    { std::ofstream(blocker) << "x"; }
    try {
      writeMasterToolingExport(planMasterToolingExport(currentSource(), "m.stl"), blocker / "inside", optionsFor("m.stl"));
      QFAIL("expected master_export_write_failed");
    } catch (const CodedError& e) {
      QCOMPARE(e.code(), std::string("master_export_write_failed"));
    }
  }

  void cancellationRemovesTheWork() {
    QTemporaryDir dir;
    CancellationToken cancel;
    cancel.cancel();
    try {
      writeMasterToolingExport(planMasterToolingExport(currentSource(), "m.stl"), fs::path(dir.path().toStdWString()), optionsFor("m.stl"), cancel);
      QFAIL("expected cancelled");
    } catch (const CodedError& e) {
      QCOMPARE(e.code(), std::string("cancelled"));
    }
    QVERIFY(entries(fs::path(dir.path().toStdWString())).empty());
  }

  void aLeftoverTemporaryFolderFromACrashIsReplaced() {
    QTemporaryDir dir;
    const fs::path parent = fs::path(dir.path().toStdWString());
    fs::create_directories(parent / "m_master_tooling.craft-export-tmp");
    { std::ofstream(parent / "m_master_tooling.craft-export-tmp" / "stale.stl") << "junk"; }
    const MasterExportResult result = writeMasterToolingExport(planMasterToolingExport(currentSource(), "m.stl"), parent, optionsFor("m.stl"));
    QCOMPARE(entries(parent), (std::vector<std::string>{"m_master_tooling"}));
    QVERIFY(!fs::exists(result.folder / "stale.stl"));
  }
};

QTEST_APPLESS_MAIN(MasterExportTest)
#include "tst_master_export.moc"
