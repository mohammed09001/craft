// Master tooling piece export: planning (what is exported, under which names), the writer (files, manifest,
// verification, never overwriting, all-or-nothing) and the failure paths.

#include <QtTest/QtTest>

#include <QCryptographicHash>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTemporaryDir>

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <set>

#include "TestMeshes.h"
#include "stl/Stl.h"
#include "threemf/ThreeMf.h"
#include "tooling/MasterToolingExport.h"

using namespace craft;
using namespace craft::toolingexport;

namespace {

namespace fs = std::filesystem;

MasterToolingPiece makePiece(const std::string& id, const std::string& name, const Bounds3& box) {
  MasterToolingPiece piece;
  piece.pieceId = id;
  piece.name = name;
  piece.mesh = test::cubeMesh(box);
  piece.bounds = box;
  piece.volumeMm3 = (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z);
  piece.triangleCount = static_cast<int>(piece.mesh.triangleCount());
  piece.watertight = true;
  piece.manifold = true;
  piece.releaseDirection = "+z";
  piece.regions = {"region-1"};
  piece.toolingRegistrationFeatureIds = {"pin-1"};
  return piece;
}

MasterToolingSetState makeSet(const std::string& id, const std::string& name, const std::string& status,
                              std::vector<MasterToolingPiece> pieces) {
  MasterToolingSetState state;
  state.moldPartId = id;
  state.moldPartName = name;
  state.status = status;
  MasterToolingSet set;
  set.moldPartId = id;
  set.moldPartName = name;
  set.releaseMode = "multi-piece";
  set.sourceSignature = "sig-" + id;
  set.fingerprint = "fp-" + id;
  set.assembly.pieces = std::move(pieces);
  set.assembly.releaseSequence.push_back({0, set.assembly.pieces.empty() ? "" : set.assembly.pieces[0].pieceId, "+z", 12.5, true, std::nullopt});
  set.assembly.registrationFeatures.push_back({"pin-1", "pin", "a", "b"});
  state.set = set;
  return state;
}

Bounds3 box(double x, double y, double z) { return {{0, 0, 0}, {x, y, z}}; }

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
    // Non-Latin names survive intact.
    const std::string arabic = "\xD9\x82\xD8\xA7\xD9\x84\xD8\xA8";  // 4 letters, 2 bytes each
    QCOMPARE(sanitizeFileComponent(arabic, "x"), arabic);
    // Truncation never splits a UTF-8 sequence: 7 bytes would end in the middle of the 4th letter.
    const std::string cut = sanitizeFileComponent(arabic, "x", 7);
    QCOMPARE(cut, arabic.substr(0, 6));
    QCOMPARE(sanitizeFileComponent(std::string(200, 'a'), "x", 60).size(), std::size_t{60});
  }

  void planExportsCurrentSetsAndExplainsEverythingElse() {
    std::vector<MasterToolingSetState> sets;
    sets.push_back(makeSet("p1", "Upper", "current", {makePiece("a", "Case A", box(10, 10, 10)), makePiece("b", "Case B", box(20, 10, 10))}));
    sets.push_back(makeSet("p2", "Lower", "stale", {makePiece("c", "Case C", box(5, 5, 5))}));
    MasterToolingSetState blocked;
    blocked.moldPartId = "p3";
    blocked.moldPartName = "Core";
    blocked.status = "blocked";
    blocked.failureMessage = "No release direction clears this part.";
    sets.push_back(blocked);
    MasterToolingSetState empty = makeSet("p4", "Empty", "current", {});
    sets.push_back(empty);

    const MasterExportPlan plan = planMasterToolingExport(sets, "bracket.stl");
    QCOMPARE(plan.stem, std::string("bracket"));
    QCOMPARE(plan.files.size(), std::size_t{2});
    QCOMPARE(plan.files[0].fileName, std::string("bracket_master_Upper_Case_A.stl"));
    QCOMPARE(plan.files[1].fileName, std::string("bracket_master_Upper_Case_B.stl"));
    QCOMPARE(plan.excluded.size(), std::size_t{3});
    QVERIFY(plan.excluded[0].reason.find("regenerate") != std::string::npos);
    QCOMPARE(plan.excluded[0].status, std::string("stale"));
    QCOMPARE(plan.excluded[1].reason, std::string("No release direction clears this part."));
    QVERIFY(plan.excluded[2].reason.find("no pieces") != std::string::npos);
    QVERIFY(plan.warnings.empty());
  }

  void planFlagsPiecesTheEngineFlaggedAndSkipsEmptyOnes() {
    MasterToolingPiece open = makePiece("a", "Open", box(10, 10, 10));
    open.watertight = false;
    MasterToolingPiece big = makePiece("b", "Big", box(10, 10, 10));
    big.fitsBuildVolume = false;
    MasterToolingPiece broken = makePiece("c", "Broken", box(10, 10, 10));
    broken.manifold = false;
    MasterToolingPiece none = makePiece("d", "None", box(10, 10, 10));
    none.mesh = {};
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current", {open, big, broken, none})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "x.stl");
    QCOMPARE(plan.files.size(), std::size_t{3});  // flagged pieces are still exported
    QCOMPARE(plan.warnings.size(), std::size_t{3});
    QVERIFY(plan.warnings[0].find("not watertight") != std::string::npos);
    QVERIFY(plan.warnings[1].find("build volume") != std::string::npos);
    QVERIFY(plan.warnings[2].find("manifold") != std::string::npos);
    QCOMPARE(plan.excluded.size(), std::size_t{1});
    QCOMPARE(plan.excluded[0].pieceId, std::string("d"));
  }

  void planGivesEveryFileAUniqueNameEvenOnCaseInsensitiveFileSystems() {
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current",
                                                    {makePiece("a", "Case", box(1, 1, 1)), makePiece("b", "case", box(2, 1, 1)),
                                                     makePiece("c", "CASE", box(3, 1, 1)), makePiece("d", "Case ?", box(4, 1, 1))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "m.stl");
    std::set<std::string> lower;
    for (const PlannedFile& f : plan.files) {
      std::string l = f.fileName;
      for (char& c : l) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      QVERIFY2(lower.insert(l).second, f.fileName.c_str());
    }
    QCOMPARE(plan.files.size(), std::size_t{4});
  }

  void writesVerifiedFilesAndAManifest() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper", "current", {makePiece("a", "Case A", box(10, 10, 10)), makePiece("b", "Case B", box(20, 10, 10))}),
                                            makeSet("p2", "Lower", "stale", {makePiece("c", "Case C", box(5, 5, 5))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "bracket.stl");
    const fs::path parent = fs::path(dir.path().toStdWString()) / "out";  // does not exist yet
    const MasterExportResult result = writeMasterToolingExport(plan, parent, optionsFor("bracket.stl"));

    QCOMPARE(result.folder.filename().string(), std::string("bracket_master_tooling"));
    QCOMPARE(result.files.size(), std::size_t{2});
    QCOMPARE(entries(result.folder), (std::vector<std::string>{"bracket_master_Upper_Case_A.stl", "bracket_master_Upper_Case_B.stl", "manifest.json"}));
    QVERIFY(!fs::exists(fs::path(result.folder) += ".craft-export-tmp"));

    // The STL round-trips through the reader: same triangle count, same vertices at float32 precision.
    const stl::ReadResult back = stl::readFile(result.files[1]);
    QCOMPARE(back.facetCount, std::size_t{12});
    const MeshPayload& source = sets[0].set->assembly.pieces[1].mesh;
    float maxX = 0;
    for (std::size_t i = 0; i < back.soup.positions.size(); i += 3) maxX = std::max(maxX, back.soup.positions[i]);
    QCOMPARE(maxX, 20.0f);
    QCOMPARE(back.soup.triangleCount(), source.triangleCount());

    const QJsonObject manifest = readManifest(result.manifest);
    QCOMPARE(manifest.value("format").toString(), QStringLiteral("craft.master-tooling-export"));
    QCOMPARE(manifest.value("formatVersion").toInt(), 1);
    QCOMPARE(manifest.value("units").toString(), QStringLiteral("millimeters"));
    QCOMPARE(manifest.value("upAxis").toString(), QStringLiteral("Z"));
    QCOMPARE(manifest.value("exportedAt").toString(), QStringLiteral("2026-01-02T03:04:05Z"));
    QCOMPARE(manifest.value("source").toObject().value("model").toString(), QStringLiteral("bracket.stl"));
    QCOMPARE(manifest.value("source").toObject().value("generationVersion").toInt(), 3);
    const QJsonArray setArray = manifest.value("toolingSets").toArray();
    QCOMPARE(setArray.size(), 1);  // the stale set is not exported ...
    const QJsonObject set = setArray.at(0).toObject();
    QCOMPARE(set.value("sourceSignature").toString(), QStringLiteral("sig-p1"));
    QCOMPARE(set.value("releaseSequence").toArray().size(), 1);
    QCOMPARE(set.value("registrationFeatures").toArray().at(0).toObject().value("kind").toString(), QStringLiteral("pin"));
    const QJsonArray excluded = manifest.value("excluded").toArray();  // ... and the manifest says so
    QCOMPARE(excluded.size(), 1);
    QCOMPARE(excluded.at(0).toObject().value("moldPartName").toString(), QStringLiteral("Lower"));

    // Every manifest entry matches the file on disk (name, size, SHA-256, triangle count, bounds).
    const QJsonArray pieces = set.value("pieces").toArray();
    QCOMPARE(pieces.size(), 2);
    for (int i = 0; i < pieces.size(); ++i) {
      const QJsonObject p = pieces.at(i).toObject();
      const fs::path file = result.folder / p.value("file").toString().toStdString();
      QVERIFY(fs::exists(file));
      QCOMPARE(QString::fromStdString(sha256OfFile(file)), p.value("sha256").toString());
      QCOMPARE(static_cast<qint64>(fs::file_size(file)), static_cast<qint64>(p.value("bytes").toDouble()));
      QCOMPARE(p.value("triangleCount").toInt(), 12);
      QVERIFY(p.value("watertight").toBool());
    }
    QCOMPARE(pieces.at(1).toObject().value("bounds").toObject().value("max").toArray().at(0).toDouble(), 20.0);
    QCOMPARE(pieces.at(1).toObject().value("volumeMm3").toDouble(), 2000.0);
    QCOMPARE(static_cast<std::uintmax_t>(result.totalBytes), fs::file_size(result.files[0]) + fs::file_size(result.files[1]) + fs::file_size(result.manifest));
  }

  void writesOneVerified3mfWithEveryPieceWhenAsked() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper", "current", {makePiece("a", "Case A", box(10, 10, 10)), makePiece("b", "Case B", box(20, 10, 10))}),
                                            makeSet("p2", "Lower", "current", {makePiece("c", "Case C", box(5, 5, 5))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "bracket.stl");
    MasterExportOptions options = optionsFor("bracket.stl");
    options.write3mf = true;
    const MasterExportResult result = writeMasterToolingExport(plan, fs::path(dir.path().toStdWString()) / "out", options);

    QCOMPARE(result.files.size(), std::size_t{3});  // the STL files are unchanged: one per piece
    QCOMPARE(result.threeMf.filename().string(), std::string("bracket_master_tooling.3mf"));
    QCOMPARE(entries(result.folder),
             (std::vector<std::string>{"bracket_master_Lower_Case_C.stl", "bracket_master_Upper_Case_A.stl", "bracket_master_Upper_Case_B.stl", "bracket_master_tooling.3mf", "manifest.json"}));

    // The package is sound on its own: one named millimetre object per piece, each the piece's triangles, closed and positive volume.
    const threemf::Report report = threemf::validateFile(result.threeMf);
    QVERIFY2(report.ok, report.problem.c_str());
    QCOMPARE(report.unit, std::string("millimeter"));
    QCOMPARE(report.objects.size(), std::size_t{3});
    QCOMPARE(report.buildItems, std::size_t{3});
    QCOMPARE(report.objects[0].name, std::string("Upper / Case A"));
    QCOMPARE(report.objects[1].name, std::string("Upper / Case B"));
    QCOMPARE(report.objects[2].name, std::string("Lower / Case C"));
    for (const threemf::ObjectReport& o : report.objects) {
      QCOMPARE(o.triangles, std::size_t{12});
      QVERIFY(o.closedTwoManifold);
    }
    QCOMPARE(report.objects[1].bounds[3], 20.0);  // max x of Case B: the 3MF carries the same millimetre frame as its STL
    QCOMPARE(report.objects[1].volume, 2000.0);

    // The manifest describes the package, and what it says is what is on disk.
    const QJsonObject manifest = readManifest(result.manifest);
    QCOMPARE(manifest.value("formatVersion").toInt(), 1);  // additive: the format version does not change
    const QJsonObject threeMf = manifest.value("threeMf").toObject();
    QCOMPARE(threeMf.value("file").toString(), QStringLiteral("bracket_master_tooling.3mf"));
    QCOMPARE(threeMf.value("unit").toString(), QStringLiteral("millimeter"));
    QCOMPARE(QString::fromStdString(sha256OfFile(result.threeMf)), threeMf.value("sha256").toString());
    QCOMPARE(static_cast<qint64>(fs::file_size(result.threeMf)), static_cast<qint64>(threeMf.value("bytes").toDouble()));
    QCOMPARE(threeMf.value("objects").toArray().size(), 3);
    QCOMPARE(threeMf.value("objects").toArray().at(2).toString(), QStringLiteral("Lower / Case C"));
    std::uintmax_t stlBytes = 0;
    for (const fs::path& f : result.files) stlBytes += fs::file_size(f);
    QCOMPARE(static_cast<std::uintmax_t>(result.totalBytes), stlBytes + fs::file_size(result.threeMf) + fs::file_size(result.manifest));
  }

  void noThreeMfIsWrittenUnlessAskedFor() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper", "current", {makePiece("a", "Case A", box(10, 10, 10))})};
    const MasterExportResult result = writeMasterToolingExport(planMasterToolingExport(sets, "bracket.stl"), fs::path(dir.path().toStdWString()), optionsFor("bracket.stl"));
    QVERIFY(result.threeMf.empty());
    QCOMPARE(entries(result.folder), (std::vector<std::string>{"bracket_master_Upper_Case_A.stl", "manifest.json"}));
    QVERIFY(!readManifest(result.manifest).contains("threeMf"));
  }

  void anOpenPieceIsStillExportedAndAnUnreportedOneIsWarnedAbout() {
    // Case B is open (a triangle missing) and the engine says so: exported with the engine's own warning, no extra one.
    // Case C is open although the engine called it clean: the 3MF check disagrees, and that is reported rather than hidden.
    MasterToolingPiece flagged = makePiece("b", "Case B", box(20, 10, 10));
    flagged.mesh.indices.resize(flagged.mesh.indices.size() - 3);
    flagged.watertight = false;
    MasterToolingPiece unreported = makePiece("c", "Case C", box(5, 5, 5));
    unreported.mesh.indices.resize(unreported.mesh.indices.size() - 3);
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper", "current", {makePiece("a", "Case A", box(10, 10, 10)), flagged, unreported})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "bracket.stl");
    MasterExportOptions options = optionsFor("bracket.stl");
    options.write3mf = true;
    const MasterExportResult result = writeMasterToolingExport(plan, fs::path(dir.path().toStdWString()), options);

    const threemf::Report report = threemf::validateFile(result.threeMf);
    QCOMPARE(report.objects.size(), std::size_t{3});
    QVERIFY(report.objects[0].closedTwoManifold);
    QVERIFY(!report.objects[1].closedTwoManifold);
    QCOMPARE(report.objects[1].triangles, std::size_t{11});
    const auto mentions = [&](const char* text) {
      return std::count_if(result.warnings.begin(), result.warnings.end(), [&](const std::string& w) { return w.find(text) != std::string::npos; });
    };
    QCOMPARE(mentions("Case B: not watertight"), 1);
    QCOMPARE(mentions("Case B: the 3MF check"), 0);
    QCOMPARE(mentions("Case C: the 3MF check"), 1);
    QCOMPARE(mentions("Case A"), 0);
    const QJsonArray warned = readManifest(result.manifest).value("warnings").toArray();
    QCOMPARE(warned.size(), static_cast<int>(result.warnings.size()));  // the manifest carries the same warnings as the result
  }

  void neverOverwritesAnEarlierExport() {
    QTemporaryDir dir;
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current", {makePiece("a", "Case", box(10, 10, 10))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "m.stl");
    const fs::path parent = fs::path(dir.path().toStdWString());
    const MasterExportResult first = writeMasterToolingExport(plan, parent, optionsFor("m.stl"));
    const std::string firstHash = sha256OfFile(first.files[0]);
    // A file the user put next to it must survive, too.
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
    const std::u8string folderName = u8"تصدير-部品-Müller";
    const fs::path parent = fs::path(dir.path().toStdWString()) / folderName;
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Müller", "current", {makePiece("a", "قطعة", box(10, 10, 10))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "جزء.stl");
    const MasterExportResult result = writeMasterToolingExport(plan, parent, optionsFor("جزء.stl"));
    QVERIFY(fs::exists(result.files[0]));
    QVERIFY(fs::exists(result.manifest));
    QCOMPARE(stl::readFile(result.files[0]).facetCount, std::size_t{12});
  }

  void nothingToExportFailsWithTheReasons() {
    QTemporaryDir dir;
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper", "stale", {makePiece("a", "Case", box(1, 1, 1))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "m.stl");
    try {
      writeMasterToolingExport(plan, fs::path(dir.path().toStdWString()), optionsFor("m.stl"));
      QFAIL("expected master_export_nothing");
    } catch (const CodedError& e) {
      QCOMPARE(e.code(), std::string("master_export_nothing"));
      QVERIFY(std::string(e.what()).find("Upper") != std::string::npos);
      QVERIFY(std::string(e.what()).find("regenerate") != std::string::npos);
    }
    QVERIFY(entries(fs::path(dir.path().toStdWString())).empty());  // not even an empty folder

    try {
      writeMasterToolingExport(planMasterToolingExport({}, "m.stl"), fs::path(dir.path().toStdWString()), optionsFor("m.stl"));
      QFAIL("expected master_export_nothing");
    } catch (const CodedError& e) {
      QVERIFY(std::string(e.what()).find("Generate the Master Mold first") != std::string::npos);
    }
  }

  void aFailureHalfWayLeavesNothingBehind() {
    QTemporaryDir dir;
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current", {makePiece("a", "One", box(1, 1, 1)), makePiece("b", "Two", box(2, 1, 1))})};
    MasterExportPlan plan = planMasterToolingExport(sets, "m.stl");
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
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current", {makePiece("a", "One", box(1, 1, 1))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "m.stl");
    try {
      writeMasterToolingExport(plan, blocker / "inside", optionsFor("m.stl"));
      QFAIL("expected master_export_write_failed");
    } catch (const CodedError& e) {
      QCOMPARE(e.code(), std::string("master_export_write_failed"));
    }
  }

  void cancellationRemovesTheWork() {
    QTemporaryDir dir;
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current", {makePiece("a", "One", box(1, 1, 1))})};
    const MasterExportPlan plan = planMasterToolingExport(sets, "m.stl");
    CancellationToken cancel;
    cancel.cancel();
    try {
      writeMasterToolingExport(plan, fs::path(dir.path().toStdWString()), optionsFor("m.stl"), cancel);
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
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current", {makePiece("a", "One", box(1, 1, 1))})};
    const MasterExportResult result = writeMasterToolingExport(planMasterToolingExport(sets, "m.stl"), parent, optionsFor("m.stl"));
    QCOMPARE(entries(parent), (std::vector<std::string>{"m_master_tooling"}));
    QVERIFY(!fs::exists(result.folder / "stale.stl"));
  }

  void manifestSaysWhenTheResultMayBeIncomplete() {
    QTemporaryDir dir;
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Set", "current", {makePiece("a", "One", box(1, 1, 1))})};
    MasterExportOptions options = optionsFor("m.stl");
    options.unportedPathsReached = true;
    options.unportedPaths = {"volumetric working-mold mode"};
    const MasterExportResult result = writeMasterToolingExport(planMasterToolingExport(sets, "m.stl"), fs::path(dir.path().toStdWString()), options);
    const QJsonObject completeness = readManifest(result.manifest).value("completeness").toObject();
    QVERIFY(completeness.value("unportedPathsReached").toBool());
    QCOMPARE(completeness.value("unportedPaths").toArray().at(0).toString(), QStringLiteral("volumetric working-mold mode"));
    QVERIFY(completeness.contains("note"));
  }
};

QTEST_APPLESS_MAIN(MasterExportTest)
#include "tst_master_export.moc"
