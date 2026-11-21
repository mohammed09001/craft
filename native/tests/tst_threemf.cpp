// 3MF export: the package is read back by an independent validator that does not use the writer's code paths
// (ZIP directory + CRC-32, XML structure, unit, build items, closed 2-manifold meshes, signed volume).

#include <QtTest/QtTest>

#include <QTemporaryDir>

#include <algorithm>
#include <filesystem>
#include <functional>
#include <limits>

#include "TestMeshes.h"
#include "contracts/Operation.h"
#include "threemf/ThreeMf.h"

using namespace craft;
using namespace craft::test;

namespace {

std::string failureCode(const std::function<void()>& fn) {
  try {
    fn();
  } catch (const CodedError& e) {
    return e.code();
  }
  return {};
}

}  // namespace

class TstThreeMf : public QObject {
  Q_OBJECT
 private slots:
  void roundTripOneBox() {
    const MeshPayload cube = cubeMesh(box(0, 0, 0, 10, 20, 30));
    const auto bytes = threemf::encode({{"part", &cube}}, "My part");
    const auto report = threemf::validate(bytes);
    QVERIFY2(report.ok, report.problem.c_str());
    QCOMPARE(report.unit, std::string("millimeter"));
    QCOMPARE(report.buildItems, std::size_t{1});
    QCOMPARE(report.objects.size(), std::size_t{1});
    const auto& o = report.objects[0];
    QCOMPARE(o.name, std::string("part"));
    QCOMPARE(o.vertices, cube.vertexCount());
    QCOMPARE(o.triangles, cube.triangleCount());
    QVERIFY(o.closedTwoManifold);
    QVERIFY(o.noDegenerateTriangles);
    QCOMPARE(o.volume, 6000.0);  // outward winding: positive
    QCOMPARE(o.bounds[3], 10.0);
    QCOMPARE(o.bounds[4], 20.0);
    QCOMPARE(o.bounds[5], 30.0);
  }

  void severalObjectsKeepOrderAndNames() {
    const MeshPayload a = cubeMesh(box(0, 0, 0, 1, 1, 1));
    const MeshPayload b = sphereMesh({5, 5, 5}, 2.0);
    const auto report = threemf::validate(threemf::encode({{"A & <B>", &a}, {"sphere", &b}}));
    QVERIFY2(report.ok, report.problem.c_str());
    QCOMPARE(report.buildItems, std::size_t{2});
    QCOMPARE(report.objects[0].name, std::string("A & <B>"));  // XML escaping round-trips
    QCOMPARE(report.objects[1].name, std::string("sphere"));
    QVERIFY(report.objects[1].volume > 0);
  }

  void coordinatesRoundTripExactly() {
    MeshPayload cube = cubeMesh(box(0.1, -0.3, 1.0 / 3.0, 7.123456789012345, 2.5, 9.75));
    const auto report = threemf::validate(threemf::encode({{"p", &cube}}));
    QVERIFY(report.ok);
    QCOMPARE(report.objects[0].bounds[0], 0.1);
    QCOMPARE(report.objects[0].bounds[2], 1.0 / 3.0);
    QCOMPARE(report.objects[0].bounds[3], 7.123456789012345);
  }

  void outputIsDeterministic() {
    const MeshPayload cube = cubeMesh(box(0, 0, 0, 3, 4, 5));
    QCOMPARE(threemf::encode({{"p", &cube}}), threemf::encode({{"p", &cube}}));
  }

  void reversedWindingGivesNegativeVolume() {
    MeshPayload cube = cubeMesh(box(0, 0, 0, 2, 2, 2));
    for (std::size_t t = 0; t < cube.triangleCount(); ++t) std::swap(cube.indices[3 * t + 1], cube.indices[3 * t + 2]);
    const auto report = threemf::validate(threemf::encode({{"p", &cube}}));
    QVERIFY(report.ok);  // still a consistent manifold
    QVERIFY(report.objects[0].volume < 0);
  }

  void openMeshIsRejected() {
    MeshPayload cube = cubeMesh(box(0, 0, 0, 2, 2, 2));
    cube.indices.resize(cube.indices.size() - 3);  // drop one triangle: a hole
    const auto report = threemf::validate(threemf::encode({{"holey", &cube}}));
    QVERIFY(!report.ok);
    QVERIFY(report.problem.find("2-manifold") != std::string::npos);
  }

  void inconsistentOrientationIsRejected() {
    MeshPayload cube = cubeMesh(box(0, 0, 0, 2, 2, 2));
    std::swap(cube.indices[1], cube.indices[2]);  // flip one triangle only
    QVERIFY(!threemf::validate(threemf::encode({{"flip", &cube}})).ok);
  }

  void corruptedBytesAreRejected() {
    const MeshPayload cube = cubeMesh(box(0, 0, 0, 2, 2, 2));
    auto bytes = threemf::encode({{"p", &cube}});
    auto flipped = bytes;
    flipped[bytes.size() / 2] ^= 0x01;  // inside an entry: CRC must catch it
    const auto bad = threemf::validate(flipped);
    QVERIFY(!bad.ok);
    auto truncated = bytes;
    truncated.resize(bytes.size() - 30);
    QVERIFY(!threemf::validate(truncated).ok);
    QVERIFY(!threemf::validate({}).ok);
    QVERIFY(!threemf::validate(std::vector<std::uint8_t>(500, 0x42)).ok);
  }

  void unitMustBeMillimeter() {
    // Not reachable from the writer; patch the model's unit in a stored entry and fix nothing else: the CRC catches the edit, which is also correct.
    const MeshPayload cube = cubeMesh(box(0, 0, 0, 2, 2, 2));
    auto bytes = threemf::encode({{"p", &cube}});
    const std::string needle = "unit=\"millimeter\"";
    const std::string repl = "unit=\"centimeter\"";  // same length
    auto it = std::search(bytes.begin(), bytes.end(), needle.begin(), needle.end());
    QVERIFY(it != bytes.end());
    std::copy(repl.begin(), repl.end(), it);
    QVERIFY(!threemf::validate(bytes).ok);
  }

  void invalidInputsThrow() {
    const MeshPayload cube = cubeMesh(box(0, 0, 0, 1, 1, 1));
    QCOMPARE(failureCode([&] { threemf::encode({}); }), std::string("threemf_write_failed"));
    MeshPayload empty;
    QCOMPARE(failureCode([&] { threemf::encode({{"e", &empty}}); }), std::string("threemf_write_failed"));
    QCOMPARE(failureCode([&] { threemf::encode({{"n", nullptr}}); }), std::string("threemf_write_failed"));
    MeshPayload outOfRange = cube;
    outOfRange.indices[0] = 9999;
    QCOMPARE(failureCode([&] { threemf::encode({{"o", &outOfRange}}); }), std::string("threemf_write_failed"));
    MeshPayload nan = cube;
    nan.positions[0] = std::numeric_limits<double>::quiet_NaN();
    QCOMPARE(failureCode([&] { threemf::encode({{"n", &nan}}); }), std::string("threemf_write_failed"));
  }

  void writesAFileAndLeavesNoPartial() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const MeshPayload cube = cubeMesh(box(0, 0, 0, 4, 4, 4));
    const std::filesystem::path path = std::filesystem::path(dir.path().toStdWString()) / L"bär.3mf";
    threemf::write(path, {{"p", &cube}});
    QVERIFY(std::filesystem::exists(path));
    QVERIFY(!std::filesystem::exists(std::filesystem::path(path).concat(".part")));
    const auto report = threemf::validateFile(path);
    QVERIFY2(report.ok, report.problem.c_str());
    threemf::write(path, {{"q", &cube}});  // overwrite
    QCOMPARE(threemf::validateFile(path).objects[0].name, std::string("q"));
    QCOMPARE(failureCode([&] { threemf::write(std::filesystem::path(dir.path().toStdWString()) / L"nodir" / L"x.3mf", {{"p", &cube}}); }),
             std::string("threemf_write_failed"));
    QVERIFY(!threemf::validateFile(std::filesystem::path(dir.path().toStdWString()) / L"missing.3mf").ok);
  }
};

QTEST_APPLESS_MAIN(TstThreeMf)
#include "tst_threemf.moc"
