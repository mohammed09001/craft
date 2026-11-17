// STL import/export tests. Reuses the repository's existing STL fixtures
// (mold/tests/fixtures/models/stl) so the native reader is exercised on the
// same files the Python importer is tested against.

#include <QtTest/QtTest>

#include <QTemporaryDir>

#include <filesystem>
#include <fstream>

#include "TestMeshes.h"
#include "contracts/Operation.h"
#include "geometry/MeshAnalysis.h"
#include "stl/Stl.h"

using namespace craft;

namespace {

std::filesystem::path fixture(const char* name) {
  return std::filesystem::path(CRAFT_REPO_ROOT) / "mold" / "tests" / "fixtures" / "models" / "stl" / name;
}

struct Failure {
  std::string code;
  std::string message;
};

template <typename Callable>
Failure failureOf(Callable&& callable) {
  try {
    callable();
  } catch (const CodedError& error) {
    return {error.code(), error.what()};
  }
  return {"", ""};
}

}  // namespace

class StlTest : public QObject {
  Q_OBJECT

 private slots:
  void readsAsciiTetrahedron() {
    const auto result = stl::readFile(fixture("closed_tetrahedron_ascii.stl"));
    QCOMPARE(result.encoding, stl::Encoding::Ascii);
    QCOMPARE(result.facetCount, std::size_t{4});
    QCOMPARE(result.soup.triangleCount(), std::size_t{4});
    const Bounds3 bounds = stl::validateDisplayable(result.soup);
    QCOMPARE(bounds, test::box(0, 0, 0, 1, 1, 1));
    // First facet, as written in the file.
    QCOMPARE(result.soup.positions[3], 1.0f);
    QCOMPARE(result.soup.positions[7], 1.0f);
  }

  void readsBinarySingleTriangle() {
    const auto result = stl::readFile(fixture("single_triangle_binary.stl"));
    QCOMPARE(result.encoding, stl::Encoding::Binary);
    QCOMPARE(result.facetCount, std::size_t{1});
    QCOMPARE(result.soup.positions,
             (std::vector<float>{0, 0, 0, 1, 0, 0, 0, 1, 0}));
  }

  void asciiAndBinaryOfSameTriangleAgree() {
    const auto ascii = stl::readFile(fixture("single_triangle_ascii.stl"));
    const auto binary = stl::readFile(fixture("single_triangle_binary.stl"));
    QCOMPARE(ascii.soup.positions, binary.soup.positions);
  }

  void rejectsTruncatedBinary() {
    const Failure failure = failureOf([] { stl::readFile(fixture("truncated_binary.stl")); });
    QCOMPARE(failure.code, std::string("stl_parse_failed"));
    QCOMPARE(failure.message, std::string("The STL file could not be parsed."));
  }

  void rejectsCorruptedAscii() {
    const Failure failure = failureOf([] { stl::readFile(fixture("corrupted_ascii.stl")); });
    QCOMPARE(failure.code, std::string("stl_parse_failed"));
  }

  void emptyGeometryIsNotDisplayable() {
    const auto result = stl::readFile(fixture("empty_geometry_ascii.stl"));
    QCOMPARE(result.facetCount, std::size_t{0});
    const Failure failure = failureOf([&] { stl::validateDisplayable(result.soup); });
    QCOMPARE(failure.code, std::string("stl_invalid_geometry"));
    QCOMPARE(failure.message, std::string("The STL file does not contain displayable vertices."));
  }

  void nonFiniteCoordinatesAreRejected() {
    const auto result = stl::readFile(fixture("non_finite_ascii.stl"));
    const Failure failure = failureOf([&] { stl::validateDisplayable(result.soup); });
    QCOMPARE(failure.message, std::string("The STL file contains invalid vertex coordinates."));
  }

  void degenerateFacetIsKeptForLaterValidation() {
    // The importer keeps the file's triangles verbatim; degenerate faces are
    // classified by the part-solid validator, not silently dropped on import.
    const auto result = stl::readFile(fixture("degenerate_face_ascii.stl"));
    QCOMPARE(result.facetCount, std::size_t{2});
  }

  void filePolicyMatchesReferenceMessages() {
    QTemporaryDir directory;
    const std::filesystem::path base = directory.path().toStdString();

    QCOMPARE(failureOf([&] { stl::readFile(base / "model.obj"); }).message,
             std::string("Only .stl files are supported."));

    std::ofstream(base / "empty.stl").close();
    QCOMPARE(failureOf([&] { stl::readFile(base / "empty.stl"); }).message,
             std::string("The STL file is empty."));

    { std::ofstream(base / "big.stl") << "solid big\nendsolid big\n"; }
    QCOMPARE(failureOf([&] { stl::readFile(base / "big.stl", 4); }).message,
             std::string("The STL file is too large for local loading."));

    QCOMPARE(failureOf([&] { stl::readFile(base / "missing.stl"); }).code,
             std::string("stl_unreadable"));
  }

  void uppercaseExtensionIsAccepted() {
    QTemporaryDir directory;
    const std::filesystem::path target =
        std::filesystem::path(directory.path().toStdString()) / "PART.STL";
    std::filesystem::copy_file(fixture("closed_tetrahedron_ascii.stl"), target);
    QCOMPARE(stl::readFile(target).facetCount, std::size_t{4});
  }

  void binaryExportRoundTripsGeometryExactly() {
    QTemporaryDir directory;
    const std::filesystem::path target =
        std::filesystem::path(directory.path().toStdString()) / "cube.stl";
    const MeshPayload cube = test::cubeMesh(test::box(-12.5, -3.25, 0, 7.75, 9.5, 40));
    stl::writeBinary(target, cube, "round-trip test");

    QCOMPARE(std::filesystem::file_size(target), std::uintmax_t{84 + 12 * 50});
    const auto result = stl::readFile(target);
    QCOMPARE(result.encoding, stl::Encoding::Binary);
    QCOMPARE(result.facetCount, std::size_t{12});
    // Coordinates survive unchanged: same units, same axes, same winding.
    QCOMPARE(result.soup.positions, test::soupFromMesh(cube).positions);
    QCOMPARE(boundsOfSoup(result.soup), test::box(-12.5, -3.25, 0, 7.75, 9.5, 40));
    QVERIFY(!std::filesystem::exists(target.string() + ".craft-tmp"));
  }

  void exportWritesOutwardUnitNormals() {
    QTemporaryDir directory;
    const std::filesystem::path target =
        std::filesystem::path(directory.path().toStdString()) / "cube.stl";
    stl::writeBinary(target, test::cubeMesh(test::box(0, 0, 0, 2, 2, 2)));

    std::ifstream stream(target, std::ios::binary);
    std::vector<char> bytes((std::istreambuf_iterator<char>(stream)), {});
    const Point3 center{1, 1, 1};
    for (int facet = 0; facet < 12; ++facet) {
      float values[12];
      std::memcpy(values, bytes.data() + 84 + facet * 50, sizeof(values));
      const double length = std::hypot(values[0], values[1], values[2]);
      QVERIFY(std::fabs(length - 1.0) < 1e-6);
      // Normal points away from the cube centre.
      const double outward = values[0] * (values[3] - center.x) + values[1] * (values[4] - center.y) +
                             values[2] * (values[5] - center.z);
      QVERIFY(outward > 0);
    }
  }

  void exportRefusesEmptyMesh() {
    QTemporaryDir directory;
    const Failure failure = failureOf([&] {
      stl::writeBinary(std::filesystem::path(directory.path().toStdString()) / "x.stl", MeshPayload{});
    });
    QCOMPARE(failure.code, std::string("stl_write_failed"));
  }
};

QTEST_APPLESS_MAIN(StlTest)
#include "tst_stl.moc"
