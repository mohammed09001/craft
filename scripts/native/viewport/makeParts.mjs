// Generates non-sphere parts for the cavity and Master Mold timings (docs/native-migration/RISKS.md R-Parts-1, matrix P2-5).
//
//   node makeParts.mjs <outDir>
//
// Closed, watertight, outward-facing binary STL meshes in millimetres, about 60 mm across, standing on z = 0:
//   gear_*.stl    24 teeth with sharp flanks and a bore (a mechanical part with many edges)
//   flower_*.stl  a ring whose outline is a sum of cosines (a free-form outline, a bore)
//   cup_*.stl     a hollow flared cup, 3 mm wall (thin and concave: the shape a mold has the most trouble with)
// Each at "s", "m" and "l" resolution. Every mesh is checked here: each edge is shared by exactly two triangles in opposite directions and the
// signed volume is positive, so a part that is not closed or is inside out is never written.
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve(process.argv[2] ?? ".");
fs.mkdirSync(outDir, { recursive: true });

function check(name, tris) {
  const edges = new Map();
  const key = (p) => p.map((v) => v.toFixed(5)).join(",");
  let volume = 0;
  for (let t = 0; t < tris.length; t += 9) {
    const v = [0, 3, 6].map((o) => tris.slice(t + o, t + o + 3));
    volume += (v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1]) - v[0][1] * (v[1][0] * v[2][2] - v[1][2] * v[2][0]) + v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0])) / 6;
    for (let e = 0; e < 3; e++) {
      const a = key(v[e]), b = key(v[(e + 1) % 3]);
      if (a === b) continue;   // a degenerate edge (never produced on purpose)
      edges.set(a + ">" + b, (edges.get(a + ">" + b) ?? 0) + 1);
    }
  }
  for (const [k, n] of edges) {
    const [a, b] = k.split(">");
    if (n !== 1 || edges.get(b + ">" + a) !== 1) throw new Error(`${name}: edge ${k} is not shared by exactly two triangles in opposite directions`);
  }
  if (!(volume > 0)) throw new Error(`${name}: signed volume ${volume} is not positive`);
  return volume;
}

function writeBinaryStl(name, triangles) {
  const volume = check(name, triangles);
  const count = triangles.length / 9;
  const buffer = Buffer.alloc(84 + 50 * count);
  buffer.write("Craft part benchmark model", 0, "latin1");
  buffer.writeUInt32LE(count, 80);
  let offset = 84;
  for (let t = 0; t < count; t++) {
    const p = t * 9;
    const ux = triangles[p + 3] - triangles[p], uy = triangles[p + 4] - triangles[p + 1], uz = triangles[p + 5] - triangles[p + 2];
    const vx = triangles[p + 6] - triangles[p], vy = triangles[p + 7] - triangles[p + 1], vz = triangles[p + 8] - triangles[p + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (const v of [nx, ny, nz]) { buffer.writeFloatLE(v, offset); offset += 4; }
    for (let k = 0; k < 9; k++) { buffer.writeFloatLE(triangles[p + k], offset); offset += 4; }
    buffer.writeUInt16LE(0, offset); offset += 2;
  }
  fs.writeFileSync(path.join(outDir, name + ".stl"), buffer);
  console.log(`${name}.stl: ${count} triangles, ${(buffer.length / 1048576).toFixed(1)} MiB, volume ${(volume / 1000).toFixed(1)} cm3`);
}

function quad(out, a, b, c, d) { out.push(...a, ...b, ...c, ...a, ...c, ...d); }

/// A prism with a round bore, from the outline radius R(theta). `n` samples round, `layers` along the height, `rings` across the faces.
function boredPrism(radiusAt, boreRadius, height, n, layers, rings) {
  const out = [];
  const at = (i, r, z) => { const th = (2 * Math.PI * (i % n)) / n; return [r * Math.cos(th), r * Math.sin(th), z]; };
  const outer = (i) => radiusAt((2 * Math.PI * (i % n)) / n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < rings; k++) {   // faces: the annulus between the bore and the outline, in `rings` steps
      const r0 = (j) => boreRadius + ((outer(i) - boreRadius) * j) / rings, r1 = (j) => boreRadius + ((outer(i + 1) - boreRadius) * j) / rings;
      quad(out, at(i, r0(k + 1), height), at(i + 1, r1(k + 1), height), at(i + 1, r1(k), height), at(i, r0(k), height));   // top, +z
      quad(out, at(i, r0(k), 0), at(i + 1, r1(k), 0), at(i + 1, r1(k + 1), 0), at(i, r0(k + 1), 0));                       // bottom, -z
    }
    for (let l = 0; l < layers; l++) {
      const z0 = (height * l) / layers, z1 = (height * (l + 1)) / layers;
      quad(out, at(i, outer(i), z0), at(i + 1, outer(i + 1), z0), at(i + 1, outer(i + 1), z1), at(i, outer(i), z1));       // outline wall, outward
      quad(out, at(i, boreRadius, z1), at(i + 1, boreRadius, z1), at(i + 1, boreRadius, z0), at(i, boreRadius, z0));       // bore wall, toward the axis
    }
  }
  return out;
}

const trapezoid = (p) => (p < 0.1 ? 0 : p < 0.3 ? (p - 0.1) / 0.2 : p < 0.6 ? 1 : p < 0.8 ? 1 - (p - 0.6) / 0.2 : 0);
const gearRadius = (teeth) => (th) => { const p = ((th * teeth) / (2 * Math.PI)) % 1; return 26 + 4 * trapezoid(p < 0 ? p + 1 : p); };
const flowerRadius = (th) => 24 + 6 * Math.cos(5 * th) + 2 * Math.cos(11 * th + 1);

/// A hollow flared cup: the (radius, height) profile revolved `n` times; segments on the axis collapse to triangles.
function cup(n, along) {
  const profile = [[0, 0], [20, 0], [25, 5], [30, 60], [27, 60], [22.5, 7], [0, 7]];
  const points = [];   // the profile with every segment cut into `along` pieces
  for (let s = 0; s + 1 < profile.length; s++)
    for (let j = 0; j < along; j++) points.push([profile[s][0] + ((profile[s + 1][0] - profile[s][0]) * j) / along, profile[s][1] + ((profile[s + 1][1] - profile[s][1]) * j) / along]);
  points.push(profile[profile.length - 1]);
  const out = [];
  const at = (i, [r, z]) => { const th = (2 * Math.PI * (i % n)) / n; return [r * Math.cos(th), r * Math.sin(th), z]; };
  for (let s = 0; s + 1 < points.length; s++) {
    const a = points[s], b = points[s + 1];
    if (a[0] === 0 && b[0] === 0) continue;   // the axis
    for (let i = 0; i < n; i++) {
      if (a[0] === 0) out.push(...at(i, a), ...at(i + 1, b), ...at(i, b));
      else if (b[0] === 0) out.push(...at(i, a), ...at(i + 1, a), ...at(i, b));
      else quad(out, at(i, a), at(i + 1, a), at(i + 1, b), at(i, b));
    }
  }
  // Which way round the revolution comes out depends on the profile's direction; make the volume positive.
  let volume = 0;
  for (let t = 0; t < out.length; t += 9) volume += (out[t] * (out[t + 4] * out[t + 8] - out[t + 5] * out[t + 7]) - out[t + 1] * (out[t + 3] * out[t + 8] - out[t + 5] * out[t + 6]) + out[t + 2] * (out[t + 3] * out[t + 7] - out[t + 4] * out[t + 6])) / 6;
  if (volume < 0) for (let t = 0; t < out.length; t += 9) for (let k = 0; k < 3; k++) { const x = out[t + 3 + k]; out[t + 3 + k] = out[t + 6 + k]; out[t + 6 + k] = x; }
  return out;
}

// (n, layers, rings) for the prisms, (n, along) for the cup; the triangle counts are in the printed list.
writeBinaryStl("gear_s", boredPrism(gearRadius(24), 8, 15, 24 * 20, 2, 2));
writeBinaryStl("gear_m", boredPrism(gearRadius(24), 8, 15, 24 * 80, 12, 12));
writeBinaryStl("gear_l", boredPrism(gearRadius(24), 8, 15, 24 * 200, 40, 40));
writeBinaryStl("flower_s", boredPrism(flowerRadius, 8, 15, 400, 2, 2));
writeBinaryStl("flower_m", boredPrism(flowerRadius, 8, 15, 2000, 10, 10));
writeBinaryStl("flower_l", boredPrism(flowerRadius, 8, 15, 6000, 30, 30));
writeBinaryStl("cup_s", cup(120, 2));
writeBinaryStl("cup_m", cup(600, 12));
writeBinaryStl("cup_l", cup(2000, 40));
