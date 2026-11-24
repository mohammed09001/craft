// Generates one very large binary STL for the large-model checks (docs/native-migration/RISKS.md, R-LargeStl-1), streaming it to disk.
//
//   node makeLargeModel.mjs <file> <segments> <rings> [radiusMm]
//
// A closed, watertight UV sphere with outward facet normals: 2 * segments * (rings - 1) triangles, 50 bytes each. The native application refuses
// files over 512 MiB (536,870,912 bytes, at most 10,737,418 triangles):
//   3000 x 1790  ->  10,734,000 triangles,  511.8 MiB   (just under the limit)
//   3000 x 1805  ->  10,824,000 triangles,  515.5 MiB   (just over: it must be refused)
import fs from "node:fs";
import path from "node:path";

const [file, segmentsArg, ringsArg, radiusArg] = process.argv.slice(2);
if (!file || !segmentsArg || !ringsArg) {
  console.error("usage: node makeLargeModel.mjs <file> <segments> <rings> [radiusMm]");
  process.exit(2);
}
const segments = Number(segmentsArg), rings = Number(ringsArg), radius = Number(radiusArg ?? 30);
const count = 2 * segments * (rings - 1);
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
const fd = fs.openSync(file, "w");

const header = Buffer.alloc(84);
header.write("Craft large-model check", 0, "latin1");
header.writeUInt32LE(count, 80);
fs.writeSync(fd, header);

// Vertex (ring r in 0..rings, segment s in 0..segments): the poles are single points.
const sinPhi = new Float64Array(rings + 1), cosPhi = new Float64Array(rings + 1);
for (let r = 0; r <= rings; r++) { const phi = (Math.PI * r) / rings; sinPhi[r] = Math.sin(phi); cosPhi[r] = Math.cos(phi); }
const sinTheta = new Float64Array(segments + 1), cosTheta = new Float64Array(segments + 1);
for (let s = 0; s <= segments; s++) { const theta = (2 * Math.PI * (s % segments)) / segments; sinTheta[s] = Math.sin(theta); cosTheta[s] = Math.cos(theta); }
const vertex = (r, s, out, at) => {
  out[at] = radius * sinPhi[r] * cosTheta[s];
  out[at + 1] = radius * sinPhi[r] * sinTheta[s];
  out[at + 2] = radius * cosPhi[r];
};

const rowTriangles = 2 * segments;
const chunk = Buffer.alloc(50 * rowTriangles);
const v = new Float64Array(9);
let written = 0;
const emit = (offset) => {
  // Facet normal from the winding (counter-clockwise seen from outside), as the reference shades with the file's normals.
  const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2];
  const wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  let o = offset;
  for (const value of [nx, ny, nz]) { chunk.writeFloatLE(value, o); o += 4; }
  for (let k = 0; k < 9; k++) { chunk.writeFloatLE(v[k], o); o += 4; }
  chunk.writeUInt16LE(0, o);
};
for (let r = 0; r < rings; r++) {
  let n = 0;
  for (let s = 0; s < segments; s++) {
    // The quad between ring r and r + 1, segments s and s + 1: two triangles, except that at a pole the two collapse to one.
    const a = [r, s], b = [r + 1, s], c = [r + 1, s + 1], d = [r, s + 1];
    const tri = (p, q, w) => { vertex(...p, v, 0); vertex(...q, v, 3); vertex(...w, v, 6); emit(50 * n++); };
    if (r > 0) tri(a, b, d);            // not at the top pole
    if (r < rings - 1) tri(b, c, d);    // not at the bottom pole
  }
  fs.writeSync(fd, chunk, 0, 50 * n);
  written += n;
}
fs.closeSync(fd);
if (written !== count) { console.error(`wrote ${written} triangles, expected ${count}`); process.exit(1); }
console.log(`${path.basename(file)}: ${count} triangles, ${((84 + 50 * count) / 1048576).toFixed(1)} MiB`);
