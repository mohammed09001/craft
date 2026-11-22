// Paths longer than Windows' MAX_PATH (260 characters), and folders and files that cannot be written. Windows ships with long paths OFF
// (HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 0), and then a plain path of 260 characters or more fails in the
// ANSI-style file API that std::filesystem and the C++ streams use, unless it carries the extended-length prefix. A deep folder is not exotic:
// a OneDrive or customer folder is 150 to 200 characters, and the names the exports add (a folder, then "<model>_master_<set>_<piece>.stl")
// push it over the limit.
#include <QtTest/QtTest>

#include <QDir>
#include <QFile>
#include <QProcess>
#include <QTemporaryDir>

#include <filesystem>
#include <fstream>
#include <optional>

#include "TestMeshes.h"
#include "path/ExtendedPath.h"
#include "project/ProjectFile.h"
#include "stl/Stl.h"
#include "threemf/ThreeMf.h"
#include "tooling/MasterToolingExport.h"

using namespace craft;
using namespace craft::toolingexport;

namespace {

// A CodedError from the code under test fails that slot only; an uncaught one would end the whole QtTest run.
#define NO_CODED_ERROR(...) \
  try { __VA_ARGS__ } catch (const CodedError& e) { QFAIL(qPrintable(QStringLiteral("%1: %2").arg(QString::fromStdString(e.code()), QString::fromUtf8(e.what())))); }

namespace fs = std::filesystem;

// A folder chain below `root` that is `target` characters long in total (an absolute path), made through Qt, which handles long paths.
QString deepFolder(const QString& root, int target) {
  QString path = QDir::toNativeSeparators(root);
  int n = 0;
  while (path.size() < target) path += QStringLiteral("\\") + QStringLiteral("segment-%1-").arg(++n) + QString(36, QLatin1Char('x'));
  return path;
}

bool makeDeep(const QString& path) { return QDir().mkpath(QDir::fromNativeSeparators(path)); }

fs::path asPath(const QString& s) { return fs::path(s.toStdWString()); }

MasterToolingPiece makePiece(const std::string& id, const std::string& name, const Bounds3& box) {
  MasterToolingPiece piece;
  piece.pieceId = id;
  piece.name = name;
  piece.mesh = test::cubeMesh(box);
  piece.bounds = box;
  piece.volumeMm3 = 1000;
  piece.triangleCount = static_cast<int>(piece.mesh.triangleCount());
  piece.watertight = true;
  piece.manifold = true;
  piece.releaseDirection = "+z";
  return piece;
}

MasterToolingSetState makeSet(const std::string& id, const std::string& name, std::vector<MasterToolingPiece> pieces) {
  MasterToolingSetState state;
  state.moldPartId = id;
  state.moldPartName = name;
  state.status = "current";
  MasterToolingSet set;
  set.moldPartId = id;
  set.moldPartName = name;
  set.releaseMode = "multi-piece";
  set.assembly.pieces = std::move(pieces);
  state.set = set;
  return state;
}

}  // namespace

class LongPathsTest : public QObject {
  Q_OBJECT

 private slots:
  void theFolderUnderTestIsReallyLongerThanMaxPath() {
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString deep = deepFolder(root.path(), 300);
    QVERIFY(deep.size() >= 300);
    QVERIFY(makeDeep(deep));
    QVERIFY(QDir(QDir::fromNativeSeparators(deep)).exists());   // Qt reaches it
  }

  void theExtendedFormIsOnlyUsedWhenItIsNeededAndCanBeUndone() {
#ifdef _WIN32
    const fs::path shortPath = L"C:\\Users\\someone\\part.stl";
    QCOMPARE(QString::fromStdWString(io::extendedLength(shortPath).wstring()), QString::fromStdWString(shortPath.wstring()));   // untouched

    const std::wstring longTail = L"\\" + std::wstring(260, L'a') + L"\\part.stl";
    const fs::path longPath = std::wstring(L"C:\\Users\\someone") + longTail;
    const fs::path extended = io::extendedLength(longPath);
    QCOMPARE(QString::fromStdWString(extended.wstring()), QString::fromStdWString(L"\\\\?\\" + longPath.wstring()));
    QCOMPARE(io::displayPath(extended).wstring(), longPath.wstring());                    // and back
    QCOMPARE(io::extendedLength(extended).wstring(), extended.wstring());                 // already extended: unchanged

    // A short folder that will get long names added: the reserve decides.
    const fs::path folder = L"C:\\Users\\someone\\Documents\\Customer";
    QCOMPARE(io::extendedLength(folder).wstring(), folder.wstring());
    QVERIFY(io::extendedLength(folder, 230).wstring().rfind(L"\\\\?\\", 0) == 0);

    // A network path keeps its server and share; forward slashes and dots are normalised, because the extended form turns Windows' own off.
    const fs::path unc = std::wstring(L"\\\\server\\share") + longTail;
    QCOMPARE(QString::fromStdWString(io::extendedLength(unc).wstring()), QString::fromStdWString(L"\\\\?\\UNC\\server\\share" + longTail));
    QCOMPARE(io::displayPath(io::extendedLength(unc)).wstring(), unc.wstring());
    const fs::path messy = std::wstring(L"C:/Users/someone/./x/../") + std::wstring(260, L'b') + L"/part.stl";
    QCOMPARE(QString::fromStdWString(io::extendedLength(messy).wstring()), QString::fromStdWString(L"\\\\?\\C:\\Users\\someone\\" + std::wstring(260, L'b') + L"\\part.stl"));

    QVERIFY(io::extendedLength(fs::path()).empty());
#else
    QSKIP("extended-length paths are a Windows matter");
#endif
  }

  void anStlRoundTripsThroughAPathOverMaxPath() {
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString deep = deepFolder(root.path(), 300);
    QVERIFY(makeDeep(deep));
    const fs::path file = asPath(deep + QStringLiteral("\\part.stl"));
    QVERIFY(file.native().size() > 260);
    const MeshPayload cube = test::cubeMesh(test::box(0, 0, 0, 10, 20, 30));
    NO_CODED_ERROR(stl::writeBinary(file, cube, "long path"); const stl::ReadResult back = stl::readFile(file); QCOMPARE(back.facetCount, std::size_t{12});)
    // Nothing is left beside it.
    int entries = 0;
    for (const QFileInfo& info : QDir(QDir::fromNativeSeparators(deep)).entryInfoList(QDir::Files | QDir::NoDotAndDotDot)) { Q_UNUSED(info); ++entries; }
    QCOMPARE(entries, 1);
  }

  void a3mfIsWrittenAndValidatedThroughAPathOverMaxPath() {
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString deep = deepFolder(root.path(), 300);
    QVERIFY(makeDeep(deep));
    const fs::path file = asPath(deep + QStringLiteral("\\mold.3mf"));
    const MeshPayload cube = test::cubeMesh(test::box(0, 0, 0, 10, 20, 30));
    NO_CODED_ERROR(threemf::write(file, {{"Body", &cube}}, "long path");)
    const threemf::Report report = threemf::validateFile(file);
    QVERIFY2(report.ok, report.problem.c_str());
    QCOMPARE(report.objects.size(), std::size_t{1});
  }

  void aMasterToolingExportWhoseNamesPushThePathOverMaxPathWorks() {
    // The parent is under the limit (about 200 characters, a realistic OneDrive folder); the export folder and the file names it adds are not.
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString deep = deepFolder(root.path(), 200);
    QVERIFY(makeDeep(deep));
    QVERIFY(deep.size() < 250);
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper mold with a long descriptive name", {makePiece("a", "Piece A with a long descriptive name", test::box(0, 0, 0, 10, 10, 10))})};
    MasterExportOptions options;
    options.modelName = "a-customer-part-with-a-rather-long-file-name.stl";
    options.write3mf = true;
    const MasterExportPlan plan = planMasterToolingExport(sets, options.modelName);
    std::optional<MasterExportResult> written;
    NO_CODED_ERROR(written = writeMasterToolingExport(plan, asPath(deep), options);)
    QVERIFY(written.has_value());
    const MasterExportResult& result = *written;
    QVERIFY(result.files.size() == 1);
    QVERIFY(result.files[0].native().size() > 260);   // the exported file's own path is past MAX_PATH
    QVERIFY(QFileInfo::exists(QString::fromStdWString(result.files[0].wstring())));
    const threemf::Report report = threemf::validateFile(result.threeMf);
    QVERIFY2(report.ok, report.problem.c_str());
    // The paths handed back are the ones the user would recognise (no \\?\ prefix to show in the UI).
    QVERIFY(!QString::fromStdWString(result.folder.wstring()).startsWith(QStringLiteral("\\\\?\\")));
    QVERIFY(!QString::fromStdWString(result.files[0].wstring()).startsWith(QStringLiteral("\\\\?\\")));
    // And no temporary folder is left behind.
    for (const QFileInfo& info : QDir(QDir::fromNativeSeparators(deep)).entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot))
      QVERIFY2(!info.fileName().endsWith(QStringLiteral(".craft-export-tmp")), qPrintable(info.fileName()));
  }

  void aNetworkPathShortAndLongIsAsGoodAsALocalOne() {
    // The machine's own administrative share (\\localhost\D$) is a real SMB path: the network stack, the \\?\UNC\ form and all.
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString local = QDir::toNativeSeparators(root.path());
    if (local.size() < 3 || local[1] != QLatin1Char(':')) QSKIP("the temporary folder is not on a drive letter");
    const QString share = QStringLiteral("\\\\localhost\\") + local[0] + QStringLiteral("$") + local.mid(2);
    if (!QFileInfo::exists(share)) QSKIP("the administrative share is not reachable on this machine");

    const MeshPayload cube = test::cubeMesh(test::box(0, 0, 0, 10, 20, 30));
    NO_CODED_ERROR(
      const fs::path shortFile = asPath(share + QStringLiteral("\\short.stl"));
      stl::writeBinary(shortFile, cube, "short network path");
      QCOMPARE(stl::readFile(shortFile).facetCount, std::size_t{12});
    )

    const QString deep = deepFolder(share, 300);
    QVERIFY(makeDeep(deep));
    const fs::path longFile = asPath(deep + QStringLiteral("\\part.stl"));
    QVERIFY(longFile.native().size() > 260);
    NO_CODED_ERROR(
      stl::writeBinary(longFile, cube, "long network path");
      QCOMPARE(stl::readFile(longFile).facetCount, std::size_t{12});
      const fs::path threeMf = asPath(deep + QStringLiteral("\\mold.3mf"));
      threemf::write(threeMf, {{"Body", &cube}}, "long network path");
      QVERIFY(threemf::validateFile(threeMf).ok);
    )

    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper", {makePiece("a", "Case A", test::box(0, 0, 0, 10, 10, 10))})};
    MasterExportOptions options;
    options.modelName = "part.stl";
    std::optional<MasterExportResult> written;
    NO_CODED_ERROR(written = writeMasterToolingExport(planMasterToolingExport(sets, options.modelName), asPath(deep), options);)
    QVERIFY(written.has_value());
    QVERIFY(written->folder.native().rfind(L"\\\\localhost\\", 0) == 0);   // handed back as the user wrote it, not as \\?\UNC\localhost\...
    QVERIFY(QFileInfo::exists(QString::fromStdWString(written->files.at(0).wstring())));
  }

  void aProjectIsSavedAndOpenedThroughAPathOverMaxPath() {
    // The project and autosave code writes through Qt (QSaveFile), which prefixes long paths itself: this pins that it keeps working.
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString deep = deepFolder(root.path(), 300);
    QVERIFY(makeDeep(deep));
    const QString path = QDir::fromNativeSeparators(deep) + QStringLiteral("/p.craft");
    QSaveFile probe(path);
    QVERIFY(probe.open(QIODevice::WriteOnly));
    probe.write("x");
    QVERIFY(probe.commit());
    QVERIFY(QFileInfo::exists(path));
    QVERIFY(project::isIntactProject(path) == false);   // not a project, but the path is reachable and the check does not throw
  }

  void overwritingAReadOnlyFileFailsCleanlyAndKeepsTheOriginal() {
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString path = root.filePath(QStringLiteral("locked.stl"));
    const fs::path file = asPath(QDir::toNativeSeparators(path));
    const MeshPayload cube = test::cubeMesh(test::box(0, 0, 0, 10, 20, 30));
    stl::writeBinary(file, cube, "first");
    const QByteArray original = [&] { QFile f(path); return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray(); }();
    QVERIFY(!original.isEmpty());
    QVERIFY(QFile::setPermissions(path, QFileDevice::ReadOwner));   // read-only attribute
    const MeshPayload bigger = test::cubeMesh(test::box(0, 0, 0, 50, 50, 50));
    bool threw = false;
    try {
      stl::writeBinary(file, bigger, "second");
    } catch (const CodedError& error) {
      threw = true;
      QCOMPARE(error.code(), std::string("stl_write_failed"));
    }
    QVERIFY2(threw, "overwriting a read-only file must be refused, not silently replace it");
    QFile::setPermissions(path, QFileDevice::ReadOwner | QFileDevice::WriteOwner);
    const QByteArray after = [&] { QFile f(path); return f.open(QIODevice::ReadOnly) ? f.readAll() : QByteArray(); }();
    QCOMPARE(after, original);   // the user's file is untouched
    QVERIFY(!QFileInfo::exists(path + QStringLiteral(".craft-tmp")));   // and no half-written sibling is left
  }

  void aFolderThatDeniesWritingFailsCleanlyAndLeavesNothing() {
    QTemporaryDir root;
    QVERIFY(root.isValid());
    const QString locked = root.filePath(QStringLiteral("locked-folder"));
    QVERIFY(QDir().mkpath(locked));
    // Deny the current user the right to create files and folders in it (an access-control entry, as a locked-down share would have).
    const QString user = qEnvironmentVariable("USERNAME");
    QProcess icacls;
    icacls.start(QStringLiteral("icacls"), {QDir::toNativeSeparators(locked), QStringLiteral("/deny"), user + QStringLiteral(":(WD,AD)")});
    if (!icacls.waitForFinished(15000) || icacls.exitCode() != 0) QSKIP("icacls could not deny write access on this machine");
    std::vector<MasterToolingSetState> sets{makeSet("p1", "Upper", {makePiece("a", "Case A", test::box(0, 0, 0, 10, 10, 10))})};
    MasterExportOptions options;
    options.modelName = "part.stl";
    bool threw = false;
    try {
      writeMasterToolingExport(planMasterToolingExport(sets, options.modelName), asPath(locked), options);
    } catch (const CodedError& error) {
      threw = true;
      QCOMPARE(error.code(), std::string("master_export_write_failed"));
    }
    QProcess reset;
    reset.start(QStringLiteral("icacls"), {QDir::toNativeSeparators(locked), QStringLiteral("/remove:d"), user});
    reset.waitForFinished(15000);
    QVERIFY2(threw, "an export into a folder that denies writing must fail with the export's own code");
    QVERIFY(QDir(locked).entryList(QDir::AllEntries | QDir::NoDotAndDotDot).isEmpty());   // nothing was left in it
  }
};

QTEST_APPLESS_MAIN(LongPathsTest)
#include "tst_long_paths.moc"
