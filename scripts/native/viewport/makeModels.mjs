// Generates the large binary STL models used by the viewport comparison (docs/native-migration/VIEWPORT_COMPARISON.md).
//
//   node makeModels.mjs <outDir>
//
// Closed, watertight, outward-facing meshes with correct facet normals (the reference shades with the file's normals), in
// millimetres, sized like a small part (about 60 mm across):
//   sphere_82k.stl    icosphere, 81,920 triangles (4 MB)
//   torus_405k.stl    torus, 405,000 triangles (20 MB: under the reference's 25 MiB limit)
//   sphere_1_3m.stl   icosphere, 1,310,720 triangles (66 MB: over the reference's limit, native only)
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve(process.argv[2] ?? ".");
fs.mkdirSync(outDir, { recursive: true });

function writeBinaryStl(file, triangles) {
  const count = triangles.length / 9;
  const buffer = Buffer.alloc(84 + 50 * count);
  buffer.write("Craft viewport comparison model", 0, "latin1");
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
  fs.writeFileSync(file, buffer);
  console.log(`${path.basename(file)}: ${count} triangles, ${(buffer.length / 1048576).toFixed(1)} MiB`);
}

function icosphere(subdivisions, radius) {
  const t = (1 + Math.sqrt(5)) / 2;
  let vertices = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let index = cache.get(key);
      if (index === undefined) {
        const [ax, ay, az] = vertices[a], [bx, by, bz] = vertices[b];
        const x = (ax + bx) / 2, y = (ay + by) / 2, z = (az + bz) / 2, l = Math.hypot(x, y, z);
        index = vertices.push([x / l, y / l, z / l]) - 1;
        cache.set(key, index);
      }
      return index;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const out = new Float32Array(faces.length * 9);
  faces.forEach(([a, b, c], i) => [a, b, c].forEach((v, k) => vertices[v].forEach((x, axis) => { out[i * 9 + k * 3 + axis] = x * radius; })));
  return out;
}

function torus(majorSegments, minorSegments, majorRadius, minorRadius) {
  const point = (i, j) => {
    const u = (i / majorSegments) * 2 * Math.PI, v = (j / minorSegments) * 2 * Math.PI;
    const ring = majorRadius + minorRadius * Math.cos(v);
    return [ring * Math.cos(u), ring * Math.sin(u), minorRadius * Math.sin(v)];
  };
  const out = new Float32Array(majorSegments * minorSegments * 18);
  let o = 0;
  const push = (...ps) => ps.forEach((p) => p.forEach((x) => { out[o++] = x; }));
  for (let i = 0; i < majorSegments; i++)
    for (let j = 0; j < minorSegments; j++) {
      const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
      push(a, b, c);  // counter-clockwise seen from outside
      push(a, c, d);
    }
  return out;
}

writeBinaryStl(path.join(outDir, "sphere_82k.stl"), icosphere(6, 30));
writeBinaryStl(path.join(outDir, "torus_405k.stl"), torus(450, 450, 30, 10));
writeBinaryStl(path.join(outDir, "sphere_1_3m.stl"), icosphere(8, 30));
