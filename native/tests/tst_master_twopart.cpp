// The planar fast path of the two-part Master Mold planner, on independently built fixtures.
//
// Every successful result is re-checked here with code that does not share the planner's verification: the returned halves are rebuilt from their
// meshes, must not overlap each other or the original model, are translated step by step along their release axis against the rest, and are mapped into
// each master's own print frame through the reported transform and checked against the printed master. Failure cases are built to be genuinely
// unmoldable with rigid halves (the trap is a cube pierced by three orthogonal holes), not tuned to the planner.

#include <QtTest>

#include <chrono>
#include <cmath>

#include "ManifoldMeshEngine.h"
#include "master/MasterContract.h"
#include "master/MasterPlanning.h"
#include "master/MasterTwoPart.h"
#include "master/TriangleIntersection.h"

using namespace craft;

namespace {

constexpr double kPi = 3.14159265358979323846;

// --- fixture meshes (outward, counter-clockwise) -------------------------------------------------------------------------------------------------

MeshPayload lathe(const std::vector<std::pair<double, double>>& profile, int segments) {
  MeshPayload m;
  std::vector<std::vector<std::uint32_t>> rings;
  for (const auto& [r, z] : profile) {
    std::vector<std::uint32_t> ring;
    if (r == 0) {
      ring.push_back(static_cast<std::uint32_t>(m.vertexCount()));
      m.positions.insert(m.positions.end(), {0, 0, z});
    } else {
      for (int j = 0; j < segments; ++j) {
        ring.push_back(static_cast<std::uint32_t>(m.vertexCount()));
        const double a = 2 * kPi * j / segments;
        m.positions.insert(m.positions.end(), {r * std::cos(a), r * std::sin(a), z});
      }
    }
    rings.push_back(ring);
  }
  const auto tri = [&](std::uint32_t a, std::uint32_t b, std::uint32_t c) { m.indices.insert(m.indices.end(), {a, b, c}); };
  for (std::size_t i = 0; i + 1 < rings.size(); ++i) {
    const auto& lo = rings[i];
    const auto& hi = rings[i + 1];
    for (int j = 0; j < segments; ++j) {
      const int k = (j + 1) % segments;
      if (lo.size() == 1) tri(lo[0], hi[static_cast<std::size_t>(k)], hi[static_cast<std::size_t>(j)]);                      // lower pole or cap centre
      else if (hi.size() == 1) tri(hi[0], lo[static_cast<std::size_t>(j)], lo[static_cast<std::size_t>(k)]);                  // upper pole or cap centre
      else {
        tri(lo[static_cast<std::size_t>(j)], lo[static_cast<std::size_t>(k)], hi[static_cast<std::size_t>(k)]);
        tri(lo[static_cast<std::size_t>(j)], hi[static_cast<std::size_t>(k)], hi[static_cast<std::size_t>(j)]);
      }
    }
  }
  return m;
}

MeshPayload sphere(double R, int rings, int segments) {  // `rings` even => a vertex ring lies exactly on the equator
  std::vector<std::pair<double, double>> p;
  p.push_back({0, -R});
  for (int k = 1; k < rings; ++k) p.push_back({R * std::sin(kPi * k / rings), -R * std::cos(kPi * k / rings)});
  p.push_back({0, R});
  return lathe(p, segments);
}

MeshPayload cylinder(double R, double H, int segments) { return lathe({{0, 0}, {R, 0}, {R, H}, {0, H}}, segments); }
MeshPayload frustum(double R0, double R1, double H, int segments) { return lathe({{0, 0}, {R0, 0}, {R1, H}, {0, H}}, segments); }

MeshPayload box(double sx, double sy, double sz) {
  MeshPayload m;
  const double v[8][3] = {{0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0}, {0, 0, 1}, {1, 0, 1}, {1, 1, 1}, {0, 1, 1}};
  for (const auto& p : v) m.positions.insert(m.positions.end(), {p[0] * sx, p[1] * sy, p[2] * sz});
  m.indices = {0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5};
  return m;
}

MeshPayload torus(double R, double r, int nu, int nv) {
  MeshPayload m;
  for (int i = 0; i < nu; ++i)
    for (int j = 0; j < nv; ++j) {
      const double u = 2 * kPi * i / nu, v = 2 * kPi * j / nv;
      m.positions.insert(m.positions.end(), {(R + r * std::cos(v)) * std::cos(u), (R + r * std::cos(v)) * std::sin(u), r * std::sin(v)});
    }
  const auto id = [&](int i, int j) { return static_cast<std::uint32_t>((i % nu) * nv + (j % nv)); };
  for (int i = 0; i < nu; ++i)
    for (int j = 0; j < nv; ++j) {
      m.indices.insert(m.indices.end(), {id(i, j), id(i + 1, j), id(i + 1, j + 1)});
      m.indices.insert(m.indices.end(), {id(i, j), id(i + 1, j + 1), id(i, j + 1)});
    }
  return m;
}

/// A bowl-like organic solid with a dimple in its top: releasable along its axis, but not a convex body.
MeshPayload dimpledBlob(int segments) {
  return lathe({{0, -10}, {6, -9}, {10, -5}, {11, 0}, {10, 5}, {7, 8}, {4, 6.5}, {0, 6}}, segments);
}

/// A plate whose top and bottom surfaces both follow z = amp * sin(x / period) * sin(y / period) (the top lifted by `thickness`): every vertical column
/// meets it in one interval, yet no plane separates the faces that look down from the faces that look up, along any axis.
MeshPayload wavyPlate(double half, int n, double amp, double period, double thickness) {
  MeshPayload m;
  const auto zOf = [&](double x, double y) { return amp * std::sin(x / period) * std::sin(y / period); };
  const int W = n + 1;
  for (const double lift : {thickness, 0.0})  // top grid first, then bottom grid
    for (int j = 0; j <= n; ++j)
      for (int i = 0; i <= n; ++i) {
        const double x = -half + 2 * half * i / n, y = -half + 2 * half * j / n;
        m.positions.insert(m.positions.end(), {x, y, zOf(x, y) + lift});
      }
  const std::uint32_t bottomBase = static_cast<std::uint32_t>(W * W);
  const auto top = [&](int i, int j) { return static_cast<std::uint32_t>(j * W + i); };
  const auto bot = [&](int i, int j) { return bottomBase + static_cast<std::uint32_t>(j * W + i); };
  for (int j = 0; j < n; ++j)
    for (int i = 0; i < n; ++i) {
      m.indices.insert(m.indices.end(), {top(i, j), top(i + 1, j), top(i + 1, j + 1), top(i, j), top(i + 1, j + 1), top(i, j + 1)});
      m.indices.insert(m.indices.end(), {bot(i, j), bot(i + 1, j + 1), bot(i + 1, j), bot(i, j), bot(i, j + 1), bot(i + 1, j + 1)});
    }
  std::vector<std::pair<int, int>> ring;  // counter-clockwise seen from above
  for (int i = 0; i < n; ++i) ring.push_back({i, 0});
  for (int j = 0; j < n; ++j) ring.push_back({n, j});
  for (int i = n; i > 0; --i) ring.push_back({i, n});
  for (int j = n; j > 0; --j) ring.push_back({0, j});
  for (std::size_t k = 0; k < ring.size(); ++k) {
    const auto [pi, pj] = ring[k];
    const auto [qi, qj] = ring[(k + 1) % ring.size()];
    m.indices.insert(m.indices.end(), {top(pi, pj), bot(pi, pj), bot(qi, qj), top(pi, pj), bot(qi, qj), top(qi, qj)});
  }
  return m;
}

/// A prism whose side walls are cut like a machined gear tooth flank: each wall is a quad with a vertex halfway up both edges, split into triangles that
/// lie in one plane (to the rounding of float32 coordinates) but touch only through their neighbours.
MeshPayload threadedPrism(int sides, double radius, double height) {
  MeshPayload m;
  const auto addRing = [&](double z) {
    for (int i = 0; i < sides; ++i) {
      const double a = 2 * kPi * i / sides;
      m.positions.insert(m.positions.end(), {radius * std::cos(a), radius * std::sin(a), z});
    }
  };
  addRing(0);
  addRing(height / 2);
  addRing(height);
  const auto at = [&](int ring, int i) { return static_cast<std::uint32_t>(ring * sides + (i % sides)); };
  for (int i = 0; i < sides; ++i) {
    m.indices.insert(m.indices.end(), {at(0, i), at(0, i + 1), at(1, i + 1)});
    m.indices.insert(m.indices.end(), {at(0, i), at(1, i + 1), at(1, i)});
    m.indices.insert(m.indices.end(), {at(1, i), at(1, i + 1), at(2, i + 1)});
    m.indices.insert(m.indices.end(), {at(1, i), at(2, i + 1), at(2, i)});
  }
  const std::uint32_t bottomCentre = static_cast<std::uint32_t>(m.vertexCount());
  m.positions.insert(m.positions.end(), {0, 0, 0});
  const std::uint32_t topCentre = static_cast<std::uint32_t>(m.vertexCount());
  m.positions.insert(m.positions.end(), {0, 0, height});
  for (int i = 0; i < sides; ++i) {
    m.indices.insert(m.indices.end(), {bottomCentre, at(0, i + 1), at(0, i)});
    m.indices.insert(m.indices.end(), {topCentre, at(2, i), at(2, i + 1)});
  }
  return m;
}

void rotate(MeshPayload& m, double ax, double ay, double az, double degrees) {
  const double n = std::sqrt(ax * ax + ay * ay + az * az);
  ax /= n; ay /= n; az /= n;
  const double c = std::cos(degrees * kPi / 180), s = std::sin(degrees * kPi / 180);
  for (std::size_t i = 0; i < m.vertexCount(); ++i) {
    const double x = m.positions[3 * i], y = m.positions[3 * i + 1], z = m.positions[3 * i + 2];
    const double d = ax * x + ay * y + az * z;
    m.positions[3 * i] = x * c + (ay * z - az * y) * s + ax * d * (1 - c);
    m.positions[3 * i + 1] = y * c + (az * x - ax * z) * s + ay * d * (1 - c);
    m.positions[3 * i + 2] = z * c + (ax * y - ay * x) * s + az * d * (1 - c);
  }
}

void scale(MeshPayload& m, double sx, double sy, double sz) {
  for (std::size_t i = 0; i < m.vertexCount(); ++i) {
    m.positions[3 * i] *= sx;
    m.positions[3 * i + 1] *= sy;
    m.positions[3 * i + 2] *= sz;
  }
}

MasterSeedSnapshot seedFor(const MeshPayload& mesh, const std::string& name) {
  MasterSeedInput input;
  auto& g = input.sourcePartGeometry;
  g.modelId = name;
  g.positions = mesh.positions;
  g.indices = mesh.indices;
  g.transform = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  Bounds3 b = emptyBounds();
  for (std::size_t i = 0; i < mesh.vertexCount(); ++i)
    for (int a = 0; a < 3; ++a) {
      b.min[a] = std::min(b.min[a], mesh.positions[3 * i + static_cast<std::size_t>(a)]);
      b.max[a] = std::max(b.max[a], mesh.positions[3 * i + static_cast<std::size_t>(a)]);
    }
  g.localBounds = b;
  g.geometryVersion = "geom-" + name;
  input.projectRevision = "rev-1";
  return worldMeshFromSnapshot(buildMasterMoldSeedSnapshot(input));
}

std::string describe(const MasterMoldOutcome& o) {
  if (o.success()) return "success";
  std::string s = std::string(masterOutcomeCodeName(o.code)) + ": " + o.failure->message;
  for (const auto& d : o.failure->diagnostics) s += " | " + d;
  return s;
}

double volumeOf(IMeshGeometryEngine&, const SolidPtr& s) { return s->isEmpty() ? 0.0 : s->volume(); }

MeshPayload mapped(const MeshPayload& m, const std::array<double, 16>& t) {
  MeshPayload out = m;
  for (std::size_t i = 0; i < m.vertexCount(); ++i) {
    const double x = m.positions[3 * i], y = m.positions[3 * i + 1], z = m.positions[3 * i + 2];
    out.positions[3 * i] = t[0] * x + t[4] * y + t[8] * z + t[12];
    out.positions[3 * i + 1] = t[1] * x + t[5] * y + t[9] * z + t[13];
    out.positions[3 * i + 2] = t[2] * x + t[6] * y + t[10] * z + t[14];
  }
  return out;
}

}  // namespace

class TstMasterTwoPart : public QObject {
  Q_OBJECT

  std::unique_ptr<IMeshGeometryEngine> engine_ = createManifoldMeshEngine();

  /// Independent re-verification of a success; shares no code with the planner's sweep.
  void verifyIndependently(const MeshPayload& original, const MasterMoldOutcome& outcome) {
    QVERIFY2(outcome.success(), describe(outcome).c_str());
    const MasterMoldPlan& plan = *outcome.plan;
    QVERIFY(validateMasterPlan(plan).empty());
    QCOMPARE(plan.masters.size(), std::size_t{2});
    IMeshGeometryEngine& e = *engine_;
    const double tol = 1e-5;
    MeshPayload floatOriginal = original;  // the planner works on the float32 coordinates an STL carries
    for (double& c : floatOriginal.positions) c = static_cast<double>(static_cast<float>(c));
    const SolidPtr part = e.solidFromMesh(floatOriginal, tol, "part");
    const SolidPtr wa = e.solidFromMesh(plan.halves[0].mesh, tol, "A"), wb = e.solidFromMesh(plan.halves[1].mesh, tol, "B");
    QVERIFY(volumeOf(e, e.intersect(wa, wb)) < 5e-2);
    QVERIFY(volumeOf(e, e.intersect(wa, part)) < 5e-2);
    QVERIFY(volumeOf(e, e.intersect(wb, part)) < 5e-2);

    // Discrete cross-check of the continuous proof: each half slides away along its axis without touching the rest.
    const Point3 ax = plan.seam.pullAxis;
    const SolidPtr restA = e.unionOf({wb, part}), restB = e.unionOf({wa, part});
    for (const double t : {0.05, 0.4, 1.0, 3.0, 10.0, 40.0}) {
      QVERIFY2(volumeOf(e, e.intersect(e.translate(wa, ax.x * t, ax.y * t, ax.z * t), restA)) < 1e-2, "half A touches the rest while sliding up");
      QVERIFY2(volumeOf(e, e.intersect(e.translate(wb, -ax.x * t, -ax.y * t, -ax.z * t), restB)) < 1e-2, "half B touches the rest while sliding down");
      QVERIFY2(volumeOf(e, e.intersect(e.translate(part, ax.x * t, ax.y * t, ax.z * t), wb)) < 1e-2, "the product touches half B while lifting out");
    }

    // Each cast half sits exactly in its own master and lifts straight out of its open top.
    for (int i = 0; i < 2; ++i) {
      const MasterTool& tool = plan.masters[static_cast<std::size_t>(i)];
      QCOMPARE(tool.facts.componentCount, 1);
      QVERIFY(tool.facts.watertight && tool.facts.manifold);
      QVERIFY(std::fabs(tool.facts.bounds.min.z) < 1e-6);  // the print bed
      const SolidPtr master = e.solidFromMesh(tool.mesh, tol, "master");
      const SolidPtr half = e.solidFromMesh(mapped(plan.halves[static_cast<std::size_t>(i)].mesh, tool.printFromModel), tol, "half in print frame");
      QVERIFY2(volumeOf(e, e.intersect(master, half)) < 1e-2, "the cast half overlaps its master");
      QVERIFY2(std::fabs(volumeOf(e, e.unionOf({master, half})) - (master->volume() + half->volume())) < 1e-2, "master and cast half do not form a flush pair");
      for (const double t : {0.05, 1.0, 5.0, 30.0, 120.0})
        QVERIFY2(volumeOf(e, e.intersect(e.translate(half, 0, 0, t), master)) < 1e-2, "the cast half catches on its master");
      QVERIFY(std::fabs(tool.fillVolumeMm3 - half->volume()) < 1e-3 * half->volume());
    }
    QCOMPARE(plan.releaseChecks.size() >= 4, true);
    for (const auto& chk : plan.releaseChecks) QCOMPARE(chk.verification, MasterVerification::Verified);
    QVERIFY(plan.fidelity.measured);
    QVERIFY2(plan.fidelity.maxDeviationMm <= plan.fidelity.toleranceMm, "fidelity outside tolerance");
  }

  void runAndVerify(const MeshPayload& mesh, const std::string& name) {
    const auto started = std::chrono::steady_clock::now();
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(mesh, name));
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - started).count();
    qInfo("%s: %s in %.0f ms", name.c_str(), describe(o).c_str(), ms);
    verifyIndependently(mesh, o);
  }

 private slots:
  void axis_boxIsFeasibleAlongEachFaceNormal() {
    const MeshPayload b = box(20, 30, 40);
    const std::vector<float> pos(b.positions.begin(), b.positions.end());
    const PlanarAxisEvaluation z = evaluatePlanarAxis(pos, b.indices, {0, 0, 1}, 1e-6);
    QVERIFY(z.feasible);
    QCOMPARE(z.widthMm, 40.0);
    QVERIFY(!evaluatePlanarAxis(pos, b.indices, {1, 1, 1}, 1e-6).feasible);
  }
  void axis_spoolIsBlockedAlongItsAxisButFreeAcrossIt() {
    const MeshPayload s = lathe({{0, 0}, {10, 0}, {10, 3}, {4, 5}, {4, 10}, {10, 12}, {10, 15}, {0, 15}}, 48);
    const std::vector<float> pos(s.positions.begin(), s.positions.end());
    QVERIFY(!evaluatePlanarAxis(pos, s.indices, {0, 0, 1}, 1e-6).feasible);
    QVERIFY(evaluatePlanarAxis(pos, s.indices, {1, 0, 0}, 1e-6).feasible);
  }

  void box_succeeds() { runAndVerify(box(30, 20, 40), "box"); }
  void sphere_succeeds() { runAndVerify(sphere(25, 24, 48), "sphere"); }
  void cylinder_succeeds() { runAndVerify(cylinder(15, 40, 48), "cylinder"); }
  void taperedSolid_succeeds() { runAndVerify(frustum(20, 8, 35, 48), "frustum"); }
  void torus_succeeds() { runAndVerify(torus(25, 8, 48, 24), "torus"); }
  void dimpledBlob_succeeds() { runAndVerify(dimpledBlob(48), "dimpled-blob"); }

  void rotatedTaperedSolid_findsTheRotatedAxis() {
    MeshPayload m = frustum(20, 8, 35, 48);
    rotate(m, 1, 2, 3, 37);
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(m, "frustum-rot"));
    verifyIndependently(m, o);
    MeshPayload axis;
    axis.positions = {0, 0, 1};
    rotate(axis, 1, 2, 3, 37);
    const Point3 p = o.plan->seam.pullAxis;
    const double d = std::fabs(p.x * axis.positions[0] + p.y * axis.positions[1] + p.z * axis.positions[2]);
    QVERIFY2(d > 0.9999, "the pull axis did not follow the rotated solid");
  }
  void rotatedOrganicShape_isReleasedAutomatically() {
    MeshPayload m = dimpledBlob(48);
    scale(m, 1.3, 0.8, 1.0);
    rotate(m, 0.3, -1, 0.7, 52);
    runAndVerify(m, "dimpled-blob-rot");
  }
  void offAxisBox_isReleasedAutomatically() {
    MeshPayload m = box(30, 20, 40);
    rotate(m, 1, 1, 0.2, 29);
    runAndVerify(m, "box-rot");
  }

  void wavyPlate_hasNoFlatSeamOnAnyAxis_butAColumnWiseSimpleCurvedOne() {
    const MeshPayload plate = wavyPlate(20, 40, 4, 5, 6);
    const std::vector<float> pos(plate.positions.begin(), plate.positions.end());
    for (const Point3 axis : {Point3{0, 0, 1}, Point3{1, 0, 0}, Point3{0, 1, 0}, Point3{1, 1, 1}})
      QVERIFY2(!evaluatePlanarAxis(pos, plate.indices, axis, 1e-5).feasible, "a flat seam would have worked: the fixture is not testing the curved path");
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(plate, "wavy"));
    QVERIFY2(o.success(), describe(o).c_str());
    QCOMPARE(o.plan->seam.kind, std::string("height-field"));
    QVERIFY(o.plan->seam.description.find("curved") != std::string::npos);
    verifyIndependently(plate, o);
    const auto& r = o.plan->residualUncertainty;
    QVERIFY(std::any_of(r.begin(), r.end(), [](const std::string& s) { return s.find("height field") != std::string::npos; }));
  }
  void rotatedWavyPlate_isFoundOffAxis() {
    MeshPayload plate = wavyPlate(20, 40, 4, 5, 6);
    rotate(plate, 1, 2, 3, 37);
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(plate, "wavy-rot"));
    QVERIFY2(o.success(), describe(o).c_str());
    QCOMPARE(o.plan->seam.kind, std::string("height-field"));
    verifyIndependently(plate, o);
  }
  void aCurvedSeamStillRefusesAnEnclosedCavity() {
    // The hollow sphere has mold trapped inside the product: no column is simple, so no seam of any shape lets the halves slide apart.
    MeshPayload outer = sphere(25, 24, 48), inner = sphere(10, 24, 48);
    const std::uint32_t base = static_cast<std::uint32_t>(outer.vertexCount());
    outer.positions.insert(outer.positions.end(), inner.positions.begin(), inner.positions.end());
    for (std::size_t i = 0; i < inner.indices.size(); i += 3) outer.indices.insert(outer.indices.end(), {inner.indices[i] + base, inner.indices[i + 2] + base, inner.indices[i + 1] + base});
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(outer, "hollow2"));
    QVERIFY(!o.success());
    if (o.code == MasterOutcomeCode::NoFeasiblePlan) QVERIFY(o.failure->message.find("not proof") != std::string::npos);
  }

  void hollowSphere_isReportedAsNoFeasiblePlan_notImpossible() {
    // An enclosed internal cavity: mold material cast into it could never leave through rigid halves.
    MeshPayload outer = sphere(25, 24, 48), inner = sphere(10, 24, 48);
    const std::uint32_t base = static_cast<std::uint32_t>(outer.vertexCount());
    outer.positions.insert(outer.positions.end(), inner.positions.begin(), inner.positions.end());
    for (std::size_t i = 0; i < inner.indices.size(); i += 3) outer.indices.insert(outer.indices.end(), {inner.indices[i] + base, inner.indices[i + 2] + base, inner.indices[i + 1] + base});
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(outer, "hollow"));
    QVERIFY(!o.success());
    QVERIFY2(o.code == MasterOutcomeCode::NoFeasiblePlan || o.code == MasterOutcomeCode::InvalidInput, describe(o).c_str());
    QVERIFY(!o.plan.has_value());
  }
  void crossHoledCube_isRejectedByEveryAxis() {
    auto& e = *engine_;
    SolidPtr cube = e.box({{-20, -20, -20}, {20, 20, 20}});
    cube = e.subtract(cube, e.cylinder(6, 50, 32, {1, 0, 0}, {-25, 0, 0}));
    cube = e.subtract(cube, e.cylinder(6, 50, 32, {0, 1, 0}, {0, -25, 0}));
    cube = e.subtract(cube, e.cylinder(6, 50, 32, {0, 0, 1}, {0, 0, -25}));
    const MeshPayload m = e.meshFromSolid(cube, {}, "trap");
    const MasterMoldOutcome o = planTwoPartMasters(e, seedFor(m, "trap"));
    QVERIFY(!o.success());
    QCOMPARE(o.code, MasterOutcomeCode::NoFeasiblePlan);
    QVERIFY2(o.failure->message.find("not proof") != std::string::npos, "a bounded search must not claim impossibility");
    QVERIFY(!o.failure->diagnostics.empty());
  }
  void openMesh_isInvalidInput() {
    MeshPayload m = box(10, 10, 10);
    m.indices.resize(m.indices.size() - 3);
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(m, "open"));
    QCOMPARE(o.code, MasterOutcomeCode::InvalidInput);
  }

  void result_isDeterministic() {
    const MeshPayload m = sphere(20, 16, 32);
    const MasterMoldOutcome a = planTwoPartMasters(*engine_, seedFor(m, "det")), b = planTwoPartMasters(*engine_, seedFor(m, "det"));
    QVERIFY(a.success() && b.success());
    QCOMPARE(a.plan->fingerprint, b.plan->fingerprint);
    QCOMPARE(a.plan->masters[0].mesh.positions, b.plan->masters[0].mesh.positions);
    QCOMPARE(a.plan->masters[1].mesh.indices, b.plan->masters[1].mesh.indices);
  }
  void cancellation_isHonoured() {
    MasterMoldEngineHooks hooks;
    hooks.cancel.cancel();
    try {
      planTwoPartMasters(*engine_, seedFor(box(10, 10, 10), "cancel"), {}, hooks);
      QFAIL("expected a cancellation");
    } catch (const CodedError& e) {
      QCOMPARE(e.code(), std::string("cancelled"));
    }
  }
  void printerBuildVolume_isEnforced() {
    MasterSeedSnapshot seed = seedFor(box(30, 20, 40), "small-printer");
    seed.printerBuildVolume = Point3{20, 20, 20};
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seed);
    QVERIFY(!o.success());
  }
  void materialEstimate_usesTheFillVolume() {
    MasterProcessProfile profile;
    profile.workingMoldDensityGPerCm3 = 1.6;
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(box(30, 20, 40), "material"), profile);
    QVERIFY2(o.success(), describe(o).c_str());
    for (const auto& m : o.plan->materials) {
      QVERIFY(m.massG.has_value());
      QVERIFY(std::fabs(*m.massG - m.volumeWithWasteMm3 / 1000.0 * 1.6) < 1e-9);
    }
    QVERIFY(!planTwoPartMasters(*engine_, seedFor(box(30, 20, 40), "material2")).plan->materials[0].massG.has_value());
  }
  void realFixture_fromEnvironment() {
    // Optional: CRAFT_MASTER_STL names a binary STL (the duck, a cup, a gear ...). The outcome is recorded, never assumed: success is asserted only by
    // the independent verification, and any failure must carry a code and a diagnosis.
    const QByteArray path = qgetenv("CRAFT_MASTER_STL");
    if (path.isEmpty()) QSKIP("CRAFT_MASTER_STL is not set");
    QFile f(QString::fromLocal8Bit(path));
    QVERIFY(f.open(QIODevice::ReadOnly));
    const QByteArray bytes = f.readAll();
    QVERIFY(bytes.size() > 84);
    quint32 count = 0;
    memcpy(&count, bytes.constData() + 80, 4);
    MeshPayload m;
    for (quint32 i = 0; i < count; ++i) {
      const char* rec = bytes.constData() + 84 + static_cast<qsizetype>(i) * 50;
      for (int v = 0; v < 3; ++v) {
        float p[3];
        memcpy(p, rec + 12 + v * 12, 12);
        m.positions.insert(m.positions.end(), {p[0], p[1], p[2]});
        m.indices.push_back(i * 3 + static_cast<std::uint32_t>(v));
      }
    }
    const auto started = std::chrono::steady_clock::now();
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(m, "real"));
    const double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    qInfo("REAL FIXTURE %s: %u triangles, %.1f s, %s", path.constData(), count, s, describe(o).c_str());
    if (o.success()) verifyIndependently(m, o);
    else QVERIFY(o.failure.has_value() && !o.failure->message.empty());
  }
  void preflight_coplanarWallTrianglesThatOnlyTouchThroughNeighboursAreNotSelfIntersection() {
    // The false refusal of the small gear and ring: walls built this way hold triangles that are coplanar only to float32 rounding.
    const MeshPayload m = threadedPrism(96, 30, 15);
    const std::vector<float> pos(m.positions.begin(), m.positions.end());
    const MeshPreflightResult r = runMeshPreflight(pos, m.indices);
    for (const auto& issue : r.issues) QVERIFY2(issue.code != "self_intersection", issue.message.c_str());
    QVERIFY(r.selfIntersectionChecked);
    QCOMPARE(r.status, std::string("valid"));
    // ... and it is a perfectly good part for the planner.
    QVERIFY2(planTwoPartMasters(*engine_, seedFor(m, "threaded-prism")).success(), "the planner refused the prism");
  }
  void preflight_theExactPairThatRefusedTheSmallGear() {
    // The first pair the old preflight flagged in the small gear: two disjoint, coplanar-to-float32 wall triangles 7.5 mm apart.
    const auto f = [](double v) { return static_cast<double>(static_cast<float>(v)); };  // the STL coordinates are float32
    const IntersectTriangle upper{{f(-29.87415), f(-2.74505), 7.5}, {f(-29.83566), f(-3.13585), 15}, {f(-29.87415), f(-2.74505), 15}};
    const IntersectTriangle lower{{f(-29.87415), f(-2.74505), 0}, {f(-29.83566), f(-3.13585), 0}, {f(-29.83566), f(-3.13585), 7.5}};
    QVERIFY2(trianglesIntersect(upper, lower), "the exact test no longer shows the old false positive; the fixture proves nothing");
    QVERIFY(!trianglesIntersect(upper, lower, 8e-6));
    // Two triangles that really overlap in one plane are still intersecting under the tolerance.
    const IntersectTriangle a{{0, 0, 0}, {10, 0, 0}, {0, 10, 0}}, b{{2, 2, 0}, {12, 2, 0}, {2, 12, 0}};
    QVERIFY(trianglesIntersect(a, b, 8e-6));
    // ... and two that cross at a real angle.
    const IntersectTriangle c{{0, 0, -1}, {10, 0, -1}, {0, 0, 1}};
    QVERIFY(trianglesIntersect(a, c, 8e-6));
  }
  void preflight_aRealSelfIntersectionIsStillRefused() {
    // Two closed boxes crossing each other as one mesh: genuinely intersecting, at a large angle.
    MeshPayload a = box(20, 20, 20), b = box(20, 20, 20);
    for (std::size_t i = 0; i < b.vertexCount(); ++i) { b.positions[3 * i] += 10; b.positions[3 * i + 1] += 10; b.positions[3 * i + 2] += 10; }
    const std::uint32_t base = static_cast<std::uint32_t>(a.vertexCount());
    a.positions.insert(a.positions.end(), b.positions.begin(), b.positions.end());
    for (const std::uint32_t i : b.indices) a.indices.push_back(i + base);
    const std::vector<float> pos(a.positions.begin(), a.positions.end());
    const MeshPreflightResult r = runMeshPreflight(pos, a.indices);
    QVERIFY(std::any_of(r.issues.begin(), r.issues.end(), [](const auto& i) { return i.code == "self_intersection"; }));
    QCOMPARE(r.status, std::string("invalid-for-master-mold"));
    QCOMPARE(planTwoPartMasters(*engine_, seedFor(a, "crossing-boxes")).code, MasterOutcomeCode::InvalidInput);
  }
  void preflight_aBoxPokingThroughAWallAtAShallowAngleIsStillRefused() {
    // A thin plate tilted 3 degrees through a box wall: shallow, but far above the float32 resolution, so it must not be taken for coplanar.
    MeshPayload a = box(20, 20, 20), b = box(30, 30, 0.4);
    rotate(b, 0, 1, 0, 3);
    for (std::size_t i = 0; i < b.vertexCount(); ++i) { b.positions[3 * i] -= 5; b.positions[3 * i + 1] -= 5; b.positions[3 * i + 2] += 10; }
    const std::uint32_t base = static_cast<std::uint32_t>(a.vertexCount());
    a.positions.insert(a.positions.end(), b.positions.begin(), b.positions.end());
    for (const std::uint32_t i : b.indices) a.indices.push_back(i + base);
    const std::vector<float> pos(a.positions.begin(), a.positions.end());
    QVERIFY(std::any_of(runMeshPreflight(pos, a.indices).issues.begin(), runMeshPreflight(pos, a.indices).issues.end(), [](const auto& i) { return i.code == "self_intersection"; }));
  }
  void preflight_aDenseMeshIsCheckedInBoundedTime() {
    const MeshPayload m = sphere(30, 200, 400);  // ~160k triangles
    const std::vector<float> pos(m.positions.begin(), m.positions.end());
    const auto started = std::chrono::steady_clock::now();
    const MeshPreflightResult r = runMeshPreflight(pos, m.indices);
    const double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    qInfo("preflight of %zu triangles: %.1f s, status %s, self-intersection checked: %d", m.triangleCount(), s, r.status.c_str(), r.selfIntersectionChecked ? 1 : 0);
    QVERIFY(r.selfIntersectionChecked);
    QVERIFY(s < 30);
    for (const auto& issue : r.issues) QVERIFY2(issue.code != "self_intersection", issue.message.c_str());
  }
  void preflight_realFixtureFromEnvironment() {
    const QByteArray path = qgetenv("CRAFT_PREFLIGHT_STL");
    if (path.isEmpty()) QSKIP("CRAFT_PREFLIGHT_STL is not set");
    QFile f(QString::fromLocal8Bit(path));
    QVERIFY(f.open(QIODevice::ReadOnly));
    const QByteArray bytes = f.readAll();
    quint32 count = 0;
    memcpy(&count, bytes.constData() + 80, 4);
    std::vector<float> pos;
    std::vector<std::uint32_t> idx;
    for (quint32 i = 0; i < count; ++i) {
      const char* rec = bytes.constData() + 84 + static_cast<qsizetype>(i) * 50;
      for (int v = 0; v < 3; ++v) {
        float p[3];
        memcpy(p, rec + 12 + v * 12, 12);
        pos.insert(pos.end(), {p[0], p[1], p[2]});
        idx.push_back(i * 3 + static_cast<std::uint32_t>(v));
      }
    }
    const auto started = std::chrono::steady_clock::now();
    const MeshPreflightResult r = runMeshPreflight(pos, idx);
    const double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    std::string issues;
    for (const auto& i : r.issues) issues += " [" + i.code + ": " + i.message + "]";
    qInfo("PREFLIGHT %s: %u triangles, %.1f s, status %s, checked %d,%s", path.constData(), count, s, r.status.c_str(), r.selfIntersectionChecked ? 1 : 0, issues.c_str());
  }
  void denseSphere_isBounded() {
    const MeshPayload m = sphere(30, 120, 240);  // ~57k triangles
    const auto started = std::chrono::steady_clock::now();
    const MasterMoldOutcome o = planTwoPartMasters(*engine_, seedFor(m, "dense"));
    const double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - started).count();
    qInfo("dense sphere: %zu triangles, %.1f s, %s", m.triangleCount(), s, describe(o).c_str());
    QVERIFY2(o.success(), describe(o).c_str());
    QVERIFY2(s < 170, "the dense sphere exceeded the interactive budget");
  }
};

QTEST_APPLESS_MAIN(TstMasterTwoPart)
#include "tst_master_twopart.moc"
