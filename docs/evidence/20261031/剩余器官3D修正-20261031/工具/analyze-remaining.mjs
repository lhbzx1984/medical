// Usage: node analyze-remaining.mjs <medical-main dir> <output file>
// Read-only measurements behind the lungs / brain / eyeball placement rules (mackdown.md section 6). Writes only <output file>.
// Placement model, as OrganModel does it: world = bodyPosition + R_y(rotation) * (scale * (point - GLB box centre)),
// scale = bodySize / longest GLB box side. Coordinates: metres, +X patient left, +Y up, +Z front (BodyParts3D atlas).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [root, outFile] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const { loadTs } = require(path.join(root, 'tests/load-ts.cjs'));
const { ORGANS } = loadTs('src/lib/organ-models.ts');
const { MeshoptDecoder } = await import(pathToFileURL(path.join(root, 'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js')).href);
await MeshoptDecoder.ready;
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'public/atlas/atlas.json'), 'utf8'));

const out = [];
const log = (s = '') => { out.push(s); console.log(s); };
const f3 = (v) => v.toFixed(3);
const v3 = (a) => `[${a.map(f3).join(', ')}]`;
const cm = (v) => (v * 100).toFixed(1);

const bounds = (pts) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  return { lo, hi, c: lo.map((v, k) => (v + hi[k]) / 2), s: lo.map((v, k) => hi[k] - v) };
};
const chunks = new Map();
const chunk = (i) => {
  if (!chunks.has(i)) chunks.set(i, zlib.gunzipSync(fs.readFileSync(path.join(root, `public/atlas/body-${i}.bin.gz`))));
  return chunks.get(i);
};
const atlasPoints = (set) => {
  const parts = atlas.parts.filter((p) => set.re.test(p.name) && (!set.system || p.system === set.system));
  const pts = [];
  for (const p of parts) {
    const buf = chunk(p.chunk);
    const pos = new Float32Array(buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12));
    const idx = new Uint32Array(buf.buffer.slice(buf.byteOffset + p.indices, buf.byteOffset + p.indices + p.indexCount * 4));
    for (let v = 0; v < p.vertexCount; v++) pts.push([pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]]);
    for (let t = 0; t < p.indexCount; t += 3) pts.push([0, 1, 2].map((k) => (pos[3 * idx[t] + k] + pos[3 * idx[t + 1] + k] + pos[3 * idx[t + 2] + k]) / 3));
  }
  return { parts, pts };
};
const glbPoints = (file) => {
  const glb = fs.readFileSync(path.join(root, 'public', file));
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const meshopt = bufferView.extensions?.EXT_meshopt_compression;
  let view, stride;
  if (meshopt) {
    const { count, byteStride, byteOffset = 0, byteLength, mode, filter } = meshopt;
    const raw = new Uint8Array(count * byteStride);
    MeshoptDecoder.decodeGltfBuffer(raw, count, byteStride, glb.subarray(28 + jsonLength + byteOffset, 28 + jsonLength + byteOffset + byteLength), mode, filter);
    view = new DataView(raw.buffer); stride = byteStride;
  } else {
    const bin = glb.subarray(28 + jsonLength);
    view = new DataView(bin.buffer, bin.byteOffset + (bufferView.byteOffset ?? 0), bufferView.byteLength);
    stride = bufferView.byteStride ?? (accessor.componentType === 5126 ? 12 : 6);
  }
  const { translation = [0, 0, 0], scale = [1, 1, 1] } = gltf.nodes[0];
  if (gltf.nodes.length !== 1 || gltf.nodes[0].rotation || gltf.nodes[0].matrix) throw new Error(`${file}: unexpected node layout`);
  const read = accessor.componentType === 5126
    ? (o) => view.getFloat32(o, true)
    : accessor.componentType === 5122 && accessor.normalized ? (o) => Math.max(view.getInt16(o, true) / 32767, -1) : null;
  if (!read) throw new Error(`${file}: unexpected position type ${accessor.componentType}`);
  const size = accessor.componentType === 5126 ? 4 : 2;
  return Array.from({ length: accessor.count }, (_, i) => [0, 1, 2].map((k) =>
    read((accessor.byteOffset ?? 0) + i * stride + size * k) * scale[k] + translation[k]));
};

// BodyOutline's lathe profile, read from the source file so it cannot drift.
const outlineSrc = fs.readFileSync(path.join(root, 'src/components/sim/BodyOutline.tsx'), 'utf8');
const profileText = /const PROFILE[^=]*=\s*\[([\s\S]*?)\n\];/.exec(outlineSrc)[1];
const PROFILE = [...profileText.matchAll(/\[\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
const outlineR = (y) => {
  if (y <= PROFILE[0][1]) return PROFILE[0][0];
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1], [r1, y1] = PROFILE[i];
    if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return 0;
};

const rotY = (p, t) => [p[0] * Math.cos(t) + p[2] * Math.sin(t), p[1], -p[0] * Math.sin(t) + p[2] * Math.cos(t)];
/** Points of a GLB as OrganModel places them. */
const place = (pts, M, position, size, rotation = 0) => {
  const s = size / Math.max(...M.s);
  return pts.map((p) => rotY([(p[0] - M.c[0]) * s, (p[1] - M.c[1]) * s, (p[2] - M.c[2]) * s], rotation).map((v, k) => v + position[k]));
};
// Filled occupancy on a G^3 grid normalised to the box of each set (column fill along y), for shape comparison.
const G = 24;
const occupancy = (pts, box) => {
  const g = new Uint8Array(G * G * G);
  const lo = new Int16Array(G * G).fill(G), hi = new Int16Array(G * G).fill(-1);
  for (const p of pts) {
    const ix = Math.min(G - 1, Math.floor(((p[0] - box.lo[0]) / (box.s[0] || 1)) * G));
    const iy = Math.min(G - 1, Math.floor(((p[1] - box.lo[1]) / (box.s[1] || 1)) * G));
    const iz = Math.min(G - 1, Math.floor(((p[2] - box.lo[2]) / (box.s[2] || 1)) * G));
    const c = ix * G + iz;
    if (iy < lo[c]) lo[c] = iy;
    if (iy > hi[c]) hi[c] = iy;
  }
  for (let c = 0; c < G * G; c++) for (let iy = lo[c]; iy <= hi[c]; iy++) g[(Math.floor(c / G) * G + iy) * G + (c % G)] = 1;
  return g;
};
const iou3 = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return i / u; };
const fillCount = (g) => g.reduce((s, v) => s + v, 0);

/** Eye GLB: the globe is every slice (along the GLB's x axis) from the low end up to the first slice after the peak whose cross-section is under 0.4 of the widest; the rest is the optic-nerve stub. */
const splitEye = (pts, M, n = 40) => {
  const sliceOf = (p) => Math.min(n - 1, Math.floor(((p[0] - M.lo[0]) / M.s[0]) * n));
  const ext = Array.from({ length: n }, () => [Infinity, -Infinity, Infinity, -Infinity]);
  for (const p of pts) { const e = ext[sliceOf(p)]; e[0] = Math.min(e[0], p[1]); e[1] = Math.max(e[1], p[1]); e[2] = Math.min(e[2], p[2]); e[3] = Math.max(e[3], p[2]); }
  const w = ext.map((e) => Math.max(e[1] - e[0], e[3] - e[2], 0)); const max = Math.max(...w);
  let cut = w.indexOf(max); while (cut < n && w[cut] > 0.4 * max) cut++;
  return { n, cut, globe: pts.filter((p) => sliceOf(p) < cut), stub: pts.filter((p) => sliceOf(p) >= cut) };
};
const rotationOf = (organ) => {
  const r = organ.bodyRotation ?? [0, 0, 0];
  if (r[0] || r[2]) throw new Error(`${organ.id}: only rotation about Y is handled`);
  return r[1];
};

// --------------------------------------------------------------------------------------------------------------------
log('Read-only measurements for lungs / brain / eyeball (metres; +X patient left, +Y up, +Z front).');
log(`BodyOutline PROFILE (r, y): ${PROFILE.map((p) => `(${p[0]}, ${p[1]})`).join(' ')}`);

// ===== A. Lungs =====
log('\n=================== A. LUNGS ===================');
const lung = ORGANS.lungs;
const lp = glbPoints(lung.glb), LM = bounds(lp);
const ROWS = 40;
const rowOf = (p) => Math.min(ROWS - 1, Math.floor(((p[1] - LM.lo[1]) / LM.s[1]) * ROWS));
const rows = Array.from({ length: ROWS }, () => ({ x: [Infinity, -Infinity], z: [Infinity, -Infinity], n: 0 }));
for (const p of lp) { const r = rows[rowOf(p)]; r.n++; r.x[0] = Math.min(r.x[0], p[0]); r.x[1] = Math.max(r.x[1], p[0]); r.z[0] = Math.min(r.z[0], p[2]); r.z[1] = Math.max(r.z[1], p[2]); }
const wide = rows.map((r) => r.x[1] - r.x[0] > LM.s[0] / 3);
const first = wide.indexOf(true), last = wide.lastIndexOf(true);
const bodyPts = lp.filter((p) => rowOf(p) >= first && rowOf(p) <= last);
const LB = bounds(bodyPts);
log(`GLB box: lo ${v3(LM.lo)} hi ${v3(LM.hi)} size ${v3(LM.s)} centre ${v3(LM.c)}; ${lp.length} vertices`);
log(`body rows ${first}-${last} of 0-${ROWS - 1} (rows narrower than 1/3 of the width are the trachea stub): body box size ${v3(LB.s)} centre ${v3(LB.c)}; stub = ${f3(LM.hi[1] - LB.hi[1])} of ${f3(LM.s[1])} (${((LM.hi[1] - LB.hi[1]) / LM.s[1] * 100).toFixed(1)}%)`);
log(`bbox centre - body centre (model units): ${v3(LM.c.map((v, k) => v - LB.c[k]))}`);
log('row  y(0=bottom)  x-width/ box-width   z-depth/ box-depth   mediastinal gap (fraction of width, central 60%)');
for (let r = 0; r < ROWS; r += 3) {
  const xs = lp.filter((p) => rowOf(p) === r).map((p) => p[0]).sort((a, b) => a - b);
  const centre = xs.filter((x) => Math.abs(x - LM.c[0]) < 0.3 * LM.s[0]);
  let gap = 0; for (let i = 1; i < centre.length; i++) gap = Math.max(gap, centre[i] - centre[i - 1]);
  const R = rows[r];
  log(`${String(r).padStart(3)}  ${(r / ROWS).toFixed(2)}          ${((R.x[1] - R.x[0]) / LM.s[0]).toFixed(2)}                 ${((R.z[1] - R.z[0]) / LM.s[2]).toFixed(2)}                 ${(gap / LM.s[0]).toFixed(2)}`);
}
// Left/right: which side is bigger and lower?
const cx = LM.c[0];
const halves = [bodyPts.filter((p) => p[0] < cx), bodyPts.filter((p) => p[0] >= cx)];
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
log('model halves of the lung body (x < centre | x >= centre): vertices ' + halves.map((h) => h.length).join(' | ') +
  `; filled voxels ${halves.map((h) => { const b = bounds(h); return fillCount(occupancy(h, LB)); }).join(' | ')}` +
  `; y 2% quantile (base) ${halves.map((h) => f3(quant(h.map((p) => p[1]), 0.02))).join(' | ')}; y 98% quantile (apex) ${halves.map((h) => f3(quant(h.map((p) => p[1]), 0.98))).join(' | ')}`);

const ribs = atlasPoints({ re: /^(Left|Right) (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) rib$/ });
const RB = bounds(ribs.pts);
const diaphragm = atlasPoints({ re: /^Diaphragm$/ });
const DB = bounds(diaphragm.pts);
const seg = atlasPoints({ re: /(segmental|lingular) bronchial tree$/ });
const SB = bounds(seg.pts);
const trachea = atlasPoints({ re: /^Trachea$/ });
const TB = bounds(trachea.pts);
const mainB = atlasPoints({ re: /^(Left main bronchus|Right main bronchus proper)$/ });
const MB = bounds(mainB.pts);
const heartA = atlasPoints({ re: /^(Cavity|Wall) of (left|right) (ventricle|atrium)$/ });
const HB = bounds(heartA.pts);
const boxLine = (label, B, n) => log(`${label.padEnd(34)} box ${v3(B.lo)} .. ${v3(B.hi)}  centre ${v3(B.c)} size ${v3(B.s)}${n === undefined ? '' : `  (${n} meshes)`}`);
boxLine('atlas ribs 1-10 (outer chest)', RB, ribs.parts.length);
boxLine('atlas diaphragm', DB, diaphragm.parts.length);
boxLine('atlas segmental/lingular trees', SB, seg.parts.length);
boxLine('atlas trachea', TB, trachea.parts.length);
boxLine('atlas main bronchi', MB, mainB.parts.length);
boxLine('atlas heart cavities + atrial walls', HB, heartA.parts.length);
const diaR = bounds(diaphragm.pts.filter((p) => p[0] < 0)), diaL = bounds(diaphragm.pts.filter((p) => p[0] >= 0));
log(`atlas diaphragm dome top: patient right (x<0) ${f3(diaR.hi[1])}, patient left ${f3(diaL.hi[1])}`);
for (const name of ['Left clavicle', 'Right clavicle', 'Body of sternum', 'Left lobe of thymus', 'Right lobe of thymus', 'Left first rib', 'Right first rib']) {
  const a = atlasPoints({ re: new RegExp(`^${name}$`) });
  if (a.pts.length) boxLine(`atlas ${name}`, bounds(a.pts)); else log(`atlas ${name}: not in atlas`);
}
log(`ribs inner estimate: outer width ${f3(RB.s[0])} - 2 x rib thickness 0.008..0.012 = ${f3(RB.s[0] - 0.024)} .. ${f3(RB.s[0] - 0.016)}; diaphragm width ${f3(DB.s[0])}`);
log(`lung currently: bodyPosition ${v3(lung.bodyPosition)} bodySize ${lung.bodySize}`);
{
  const placed = place(lp, LM, lung.bodyPosition, lung.bodySize);
  const PB = bounds(placed);
  const PBody = bounds(place(bodyPts, LM, lung.bodyPosition, lung.bodySize));
  log(`  rendered GLB box ${v3(PB.lo)} .. ${v3(PB.hi)} size ${v3(PB.s)}; body (no trachea) y ${f3(PBody.lo[1])} .. ${f3(PBody.hi[1])} size ${v3(PBody.s)}`);
  log(`  vs ribs 1-10 outer box: margin x ${cm(RB.hi[0] - PB.hi[0])} / ${cm(PB.lo[0] - RB.lo[0])} cm (left/right, negative = outside), z ${cm(RB.hi[2] - PB.hi[2])} / ${cm(PB.lo[2] - RB.lo[2])} cm (front/back)`);
  const inside = (pt, B) => pt.every((v, k) => v >= B.lo[k] && v <= B.hi[k]);
  log(`  segmental trees inside rendered lung body box: ${(seg.pts.filter((p) => inside(p, PBody)).length / seg.pts.length * 100).toFixed(1)}% of ${seg.pts.length} atlas points`);
}
log('\ncandidate lung body widths (uniform scale; body = GLB without trachea stub):');
log('width   bodySize  body height  depth    stub    body-bottom for bronchi-centred  bodyPosition y');
for (const W of [0.243, 0.25, 0.257, 0.265]) {
  const s = W / LM.s[0];
  const size = s * Math.max(...LM.s);
  const bh = LB.s[1] * s, depth = LM.s[2] * s, stub = (LM.hi[1] - LB.hi[1]) * s;
  const yc = SB.c[1];                       // body centred on the segmental bronchial trees
  const yBody = yc;                         // body centre
  const yPos = yBody + (LM.c[1] - LB.c[1]) * s;
  log(`${f3(W)}   ${f3(size)}     ${f3(bh)}        ${f3(depth)}    ${f3(stub)}   body ${f3(yBody - bh / 2)} .. ${f3(yBody + bh / 2)} (trachea to ${f3(yBody + bh / 2 + stub)})        ${f3(yPos)}`);
}
// Heart overlap with the lungs: fraction of heart-model vertices inside the filled lung body (x-interval per half, per y/z cell).
{
  const hm = glbPoints(ORGANS.heart.glb), HM = bounds(hm);
  const heartPlaced = place(hm, HM, ORGANS.heart.bodyPosition, ORGANS.heart.bodySize);
  const report = (label, position, size) => {
    const lungPlaced = place(bodyPts, LM, position, size);
    const BL = bounds(lungPlaced);
    // 5 mm cells in (y, z); per cell and half, filled x-interval [min, max]
    const cell = 0.005;
    const key = (p) => `${Math.floor(p[1] / cell)}_${Math.floor(p[2] / cell)}_${p[0] < position[0] ? 0 : 1}`;
    const iv = new Map();
    for (const p of lungPlaced) { const k = key(p); const e = iv.get(k); if (e) { e[0] = Math.min(e[0], p[0]); e[1] = Math.max(e[1], p[0]); } else iv.set(k, [p[0], p[0]]); }
    let inLung = 0;
    for (const p of heartPlaced) { for (const half of [0, 1]) { const e = iv.get(`${Math.floor(p[1] / cell)}_${Math.floor(p[2] / cell)}_${half}`); if (e && p[0] >= e[0] && p[0] <= e[1]) { inLung++; break; } } }
    const HP = bounds(heartPlaced);
    log(`  ${label}: heart box ${v3(HP.lo)} .. ${v3(HP.hi)}; heart vertices inside the filled lung (approximate): ${(inLung / heartPlaced.length * 100).toFixed(1)}%; lung body x ${f3(BL.lo[0])} .. ${f3(BL.hi[0])}`);
  };
  log('heart-lung overlap (the lung GLB has only a ~' + 'narrow gap in the middle, no cardiac space):');
  report('current lungs', lung.bodyPosition, lung.bodySize);
  const W = 0.25, s = W / LM.s[0];
  report(`width ${W} lungs centred y=${f3(SB.c[1])}`, [0, SB.c[1] + (LM.c[1] - LB.c[1]) * s, 0], s * Math.max(...LM.s));
}

// ===== B. Brain =====
log('\n=================== B. BRAIN ===================');
const BRAIN = /gyrus|occipital lobe|parietal lobule|insula|White matter of|Corpus callosum|^Cerebellum$|^Pons$|Medulla oblongata|^Midbrain$|Peduncle of midbrain|thalamus$|^Hypothalamus$|hippocampus|amygdala|caudate nucleus|putamen|globus pallidus|internal capsule|fornix of forebrain|colliculus$|geniculate body/;
const brainA = atlasPoints({ re: BRAIN, system: 'nervous' });
const BA = bounds(brainA.pts);
const bp = glbPoints(ORGANS.brain.glb), BM = bounds(bp);
boxLine('atlas brain', BA, brainA.parts.length);
log(`brain GLB box size ${v3(BM.s)} (proportions ${v3(BM.s.map((v) => v / Math.max(...BM.s)))}); atlas proportions ${v3(BA.s.map((v) => v / Math.max(...BA.s)))}`);
log('shape match after turning the GLB about Y (filled 3D occupancy IoU, both boxes normalised to a unit cube; mirror = x -> -x after the turn):');
const normBox = (pts) => bounds(pts);
const results = [];
for (const deg of [0, 90, 180, 270]) for (const mirror of [false, true]) {
  const turned = bp.map((p) => rotY([p[0] - BM.c[0], p[1] - BM.c[1], p[2] - BM.c[2]], (deg * Math.PI) / 180)).map((p) => (mirror ? [-p[0], p[1], p[2]] : p));
  const TBx = normBox(turned);
  results.push({ deg, mirror, iou: iou3(occupancy(turned, TBx), occupancy(brainA.pts, BA)), size: TBx.s });
}
for (const r of results) log(`  turn ${String(r.deg).padStart(3)} deg${r.mirror ? ' + mirror' : '         '}: IoU ${r.iou.toFixed(3)}   turned box size ${v3(r.size.map((v) => v * ORGANS.brain.bodySize / Math.max(...BM.s)))} at bodySize ${ORGANS.brain.bodySize}`);
{
  // Which end is the back? lowest 15% of height: the cerebellum / brainstem sit behind and below.
  const band = (pts, B) => pts.filter((p) => p[1] < B.lo[1] + 0.15 * B.s[1]);
  const cen = (pts, B) => { const m = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length); return m.map((v, k) => (v - B.c[k]) / (B.s[k] / 2)); };
  log(`lowest 15% of height, centroid offset from box centre (fraction of half size): atlas ${v3(cen(band(brainA.pts, BA), BA))}; model ${v3(cen(band(bp, BM), BM))}`);
  const cb = atlasPoints({ re: /^Cerebellum$/ });
  boxLine('atlas cerebellum', bounds(cb.pts));
}
const best = results.reduce((a, b) => (b.iou > a.iou ? b : a));
log(`best match: turn ${best.deg} deg${best.mirror ? ' + mirror' : ''} (IoU ${best.iou.toFixed(3)})`);

// ===== C. Eyeball =====
log('\n=================== C. EYEBALL ===================');
const eyeA = atlasPoints({ re: /^Left (sclera|cornea)$/ });
const EA = bounds(eyeA.pts);
const ep = glbPoints(ORGANS.eyeball.glb), EM = bounds(ep);
boxLine('atlas left sclera + cornea', EA, eyeA.parts.length);
const eyeRight = atlasPoints({ re: /^Right (sclera|cornea)$/ });
boxLine('atlas right sclera + cornea', bounds(eyeRight.pts), eyeRight.parts.length);
const scleraOnly = atlasPoints({ re: /^Left sclera$/ });
boxLine('atlas left sclera only', bounds(scleraOnly.pts));
log(`eye GLB box size ${v3(EM.s)} (proportions ${v3(EM.s.map((v) => v / Math.max(...EM.s)))}); atlas proportions ${v3(EA.s.map((v) => v / Math.max(...EA.s)))}`);
{
  const mean = [0, 1, 2].map((k) => ep.reduce((s, p) => s + p[k], 0) / ep.length);
  const rad = ep.map((p) => Math.hypot(p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]));
  const med = quant(rad, 0.5);
  const farLimit = quant(rad, 0.97);
  const far = ep.filter((p, i) => rad[i] > farLimit);
  const dir = [0, 1, 2].map((k) => far.reduce((s, p) => s + p[k] - mean[k], 0) / far.length);
  const len = Math.hypot(...dir);
  log(`vertex centroid ${v3(mean)}; median radius ${f3(med)} (model units); farthest 3% of vertices: mean direction ${v3(dir.map((v) => v / len))}, distance ${f3(len)} (${(len / med).toFixed(2)} x median radius)`);
  log('eye: IoU after turning about Y (filled occupancy):');
  const r2 = [];
  for (const deg of [0, 90, 180, 270]) for (const mirror of [false, true]) {
    const turned = ep.map((p) => rotY([p[0] - EM.c[0], p[1] - EM.c[1], p[2] - EM.c[2]], (deg * Math.PI) / 180)).map((p) => (mirror ? [-p[0], p[1], p[2]] : p));
    const TBx = bounds(turned);
    r2.push({ deg, mirror, iou: iou3(occupancy(turned, TBx), occupancy(eyeA.pts, EA)) });
  }
  for (const r of r2) log(`  turn ${String(r.deg).padStart(3)} deg${r.mirror ? ' + mirror' : '         '}: IoU ${r.iou.toFixed(3)}`);
  const sd = dir.map((v) => v / len);
  const turnedDir = rotY(sd, Math.PI / 2);
  log(`optic-nerve direction in the GLB ${v3(sd)}; after a +90 deg turn about Y: ${v3(turnedDir)} (a left eye's nerve should leave backwards (-z) and towards the midline (-x))`);
}
{
  const tr = (() => {
    // thin stub at the nerve end: slices along the GLB's x axis narrower than 1/3 of the widest cross-section
    const n = 40; const ext = Array.from({ length: n }, () => [Infinity, -Infinity, Infinity, -Infinity]);
    for (const p of ep) { const e = ext[Math.min(n - 1, Math.floor(((p[0] - EM.lo[0]) / EM.s[0]) * n))]; e[0] = Math.min(e[0], p[1]); e[1] = Math.max(e[1], p[1]); e[2] = Math.min(e[2], p[2]); e[3] = Math.max(e[3], p[2]); }
    const w = ext.map((e) => Math.max(e[1] - e[0], e[3] - e[2], 0)); const max = Math.max(...w);
    let hi = 0; while (hi < n && w[n - 1 - hi] < max / 3) hi++;
    return { hi, widths: w.map((v) => (v / max).toFixed(2)) };
  })();
  log(`GLB x-axis slice widths / widest (40 slices, low x -> high x): ${tr.widths.join(' ')}; thin slices at the high-x end: ${tr.hi}`);
}

{
  // Globe vs optic-nerve stub, along the GLB's x axis: the globe is every slice up to the last one wider than 0.4 of the widest cross-section.
  const { n, cut, globe, stub } = splitEye(ep, EM);
  const GB = bounds(globe);
  const sc = ORGANS.eyeball.bodySize / Math.max(...EM.s);
  const mean = (pts) => [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const sCentre = mean(stub);
  const nd = sCentre.map((v, k) => v - GB.c[k]); const nl = Math.hypot(...nd);
  const ndir = nd.map((v) => v / nl);
  log(`globe = x slices 0-${cut - 1} of 0-${n - 1} (${(cut / n * 100).toFixed(0)}% of the GLB length), stub = slices ${cut}-${n - 1} (${stub.length} vertices)`);
  log(`globe box size ${v3(GB.s)} centre ${v3(GB.c)} (GLB box centre ${v3(EM.c)}); globe centre - box centre ${v3(GB.c.map((v, k) => v - EM.c[k]))} model units = ${v3(GB.c.map((v, k) => (v - EM.c[k]) * sc))} m at bodySize ${ORGANS.eyeball.bodySize}`);
  log(`globe diameter: y ${f3(GB.s[1])} z ${f3(GB.s[2])} model units; as fractions of the GLB's longest side ${f3(GB.s[1] / Math.max(...EM.s))} / ${f3(GB.s[2] / Math.max(...EM.s))}; globe length along x ${f3(GB.s[0] / Math.max(...EM.s))}`);
  log(`optic-nerve direction (stub centroid - globe centre) ${v3(ndir)}, ${f3(nl)} model units; after a +90 deg turn about Y: ${v3(rotY(ndir, Math.PI / 2))}`);
  for (const S of [0.03, 0.032, 0.034]) {
    const k = S / Math.max(...EM.s);
    log(`  bodySize ${S}: globe diameter y ${f3(GB.s[1] * k)} m, x(after turn) ${f3(GB.s[2] * k)} m, front-back ${f3(GB.s[0] * k)} m; atlas sclera 0.026 / cornea tip adds 0.002`);
  }
}

// ===== D. Head: placement against BodyOutline =====
log('\n=================== D. HEAD ORGANS AGAINST THE BODY OUTLINE ===================');
const skin = atlasPoints({ re: /^Skin$/ });
log(`atlas skin mesh: ${skin.pts.length ? 'present' : 'none'}`);
const radialStats = (pts) => {
  let outside = 0, worst = 0, worstAt = null;
  for (const p of pts) { const over = Math.hypot(p[0], p[2]) - outlineR(p[1]); if (over > 0) outside++; if (over > worst) { worst = over; worstAt = p; } }
  return { frac: outside / pts.length, worst, worstAt };
};
log('brain (turned +90 deg about Y, bodySize 0.18): fraction of vertices outside the outline lathe, worst protrusion');
log('  y-centre  z-centre  x-centre   outside   worst protrusion   top   bottom   brain top vs outline top');
const brainSize = 0.18;
const brainCandidates = [];
for (const y of [1.626, 1.65, 1.67, 1.687, 1.70]) for (const z of [-0.02, -0.01, 0.0, 0.01]) brainCandidates.push([0, y, z]);
for (const pos of brainCandidates) {
  const placed = place(bp, BM, pos, brainSize, Math.PI / 2);
  const st = radialStats(placed), B = bounds(placed);
  log(`  ${f3(pos[1])}    ${f3(pos[2])}    ${f3(pos[0])}    ${(st.frac * 100).toFixed(1).padStart(5)}%    ${cm(st.worst).padStart(5)} cm          ${f3(B.hi[1])} ${f3(B.lo[1])}   ${cm(outlineR(B.hi[1]))} cm outline radius at the brain top`);
}
log('current brain placement (registry rotation applied):');
{
  const placed = place(bp, BM, ORGANS.brain.bodyPosition, ORGANS.brain.bodySize, rotationOf(ORGANS.brain));
  const st = radialStats(placed), B = bounds(placed);
  log(`  ${v3(ORGANS.brain.bodyPosition)} size ${ORGANS.brain.bodySize} rotation ${rotationOf(ORGANS.brain).toFixed(4)}: outside ${(st.frac * 100).toFixed(1)}%, worst ${cm(st.worst)} cm; y ${f3(B.lo[1])} .. ${f3(B.hi[1])}; box size ${v3(B.s)}`);
}
log('eyeball (turned +90 deg about Y): fraction outside the outline lathe');
log('  (first line = registry value with the registry rotation; the others are candidate values turned +90 deg)');
for (const [pos, size, rot] of [[ORGANS.eyeball.bodyPosition, ORGANS.eyeball.bodySize, rotationOf(ORGANS.eyeball)], [[0.029, 1.657, 0.052], 0.03, Math.PI / 2], [[0.029, 1.657, 0.0505], 0.03, Math.PI / 2]]) {
  const placed = place(ep, EM, pos, size, rot);
  const st = radialStats(placed), B = bounds(placed);
  log(`  ${v3(pos)} size ${size}: outside ${(st.frac * 100).toFixed(1)}%, worst ${cm(st.worst)} cm; box ${v3(B.lo)} .. ${v3(B.hi)} size ${v3(B.s)}; outline radius at the eye height ${cm(outlineR(pos[1]))} cm`);
}
{
  // eye vs brain overlap in the final head arrangement: fraction of eye vertices inside the filled brain
  const brainP = place(bp, BM, ORGANS.brain.bodyPosition, ORGANS.brain.bodySize, rotationOf(ORGANS.brain));
  const eyeP = place(ep, EM, ORGANS.eyeball.bodyPosition, ORGANS.eyeball.bodySize, rotationOf(ORGANS.eyeball));
  const cell = 0.004;
  const iv = new Map();
  const key = (p) => `${Math.floor(p[0] / cell)}_${Math.floor(p[2] / cell)}`;
  for (const p of brainP) { const k = key(p); const e = iv.get(k); if (e) { e[0] = Math.min(e[0], p[1]); e[1] = Math.max(e[1], p[1]); } else iv.set(k, [p[1], p[1]]); }
  let inside = 0;
  for (const p of eyeP) { const e = iv.get(key(p)); if (e && p[1] >= e[0] && p[1] <= e[1]) inside++; }
  const ivA = new Map();
  for (const p of brainA.pts) { const k = key(p); const e = ivA.get(k); if (e) { e[0] = Math.min(e[0], p[1]); e[1] = Math.max(e[1], p[1]); } else ivA.set(k, [p[1], p[1]]); }
  let insideA = 0;
  for (const p of eyeA.pts) { const e = ivA.get(key(p)); if (e && p[1] >= e[0] && p[1] <= e[1]) insideA++; }
  {
    const sp = splitEye(ep, EM);
    const share = (pts) => { const placed = place(pts, EM, ORGANS.eyeball.bodyPosition, ORGANS.eyeball.bodySize, rotationOf(ORGANS.eyeball)); let c = 0; for (const p of placed) { const e = iv.get(key(p)); if (e && p[1] >= e[0] && p[1] <= e[1]) c++; } return `${(c / placed.length * 100).toFixed(1)}% of ${placed.length}`; };
    log(`  of which globe vertices inside the filled brain: ${share(sp.globe)}; optic-nerve stub vertices: ${share(sp.stub)} (the nerve runs into the skull)`);
  }
  log(`same measure on the atlas itself (left sclera+cornea vs the atlas brain structures): ${(insideA / eyeA.pts.length * 100).toFixed(1)}% of the eye's points`);
  log(`eye vertices inside the filled brain (registry values: brain ${v3(ORGANS.brain.bodyPosition)}, eye ${v3(ORGANS.eyeball.bodyPosition)}): ${(inside / eyeP.length * 100).toFixed(1)}%`);
}
log('\natlas head reference: skin top 1.719, widest head half-width 0.080 at 1.64, narrowest neck 1.52; outline: top 1.78, widest r 0.100 at 1.70, narrowest neck 1.56 -> outline head sits 0.061 above the atlas at the top');

// ===== E. Current registry against the atlas (the numbers quoted in mackdown.md section 6) =====
log('\n=================== E. CURRENT REGISTRY VS ATLAS (rotation applied as OrganModel does) ===================');
{
  const o = ORGANS.lungs, r = rotationOf(o);
  const all = bounds(place(lp, LM, o.bodyPosition, o.bodySize, r));
  const body = bounds(place(bodyPts, LM, o.bodyPosition, o.bodySize, r));
  log(`lungs ${v3(o.bodyPosition)} size ${o.bodySize}: body (no trachea stub) box ${v3(body.lo)} .. ${v3(body.hi)} size ${v3(body.s)}; trachea top ${f3(all.hi[1])} (atlas trachea top ${f3(TB.hi[1])})`);
  log(`  inside ribs 1-10 outer box, margin per side (cm): x left ${cm(RB.hi[0] - body.hi[0])} right ${cm(body.lo[0] - RB.lo[0])}; z front ${cm(RB.hi[2] - body.hi[2])} back ${cm(body.lo[2] - RB.lo[2])}; apex ${cm(RB.hi[1] - body.hi[1])} below the first-rib top`);
  log(`  atlas segmental trees inside the lung body (cm, positive = inside): x ${cm(SB.lo[0] - body.lo[0])} / ${cm(body.hi[0] - SB.hi[0])}; y ${cm(SB.lo[1] - body.lo[1])} / ${cm(body.hi[1] - SB.hi[1])}; z ${cm(SB.lo[2] - body.lo[2])} / ${cm(body.hi[2] - SB.hi[2])}`);
  const heartPts = place(glbPoints(ORGANS.heart.glb), bounds(glbPoints(ORGANS.heart.glb)), ORGANS.heart.bodyPosition, ORGANS.heart.bodySize);
  const cell = 0.005, iv = new Map();
  const key = (p, half) => `${Math.floor(p[1] / cell)}_${Math.floor(p[2] / cell)}_${half}`;
  for (const p of place(bodyPts, LM, o.bodyPosition, o.bodySize, r)) { const k = key(p, p[0] < o.bodyPosition[0] ? 0 : 1); const e = iv.get(k); if (e) { e[0] = Math.min(e[0], p[0]); e[1] = Math.max(e[1], p[0]); } else iv.set(k, [p[0], p[0]]); }
  let inLung = 0;
  for (const p of heartPts) for (const half of [0, 1]) { const e = iv.get(key(p, half)); if (e && p[0] >= e[0] && p[0] <= e[1]) { inLung++; break; } }
  log(`  heart vertices inside the filled lung body (approximate, 5 mm cells): ${(inLung / heartPts.length * 100).toFixed(1)}%`);
}
{
  const o = ORGANS.brain, r = rotationOf(o);
  const placed = place(bp, BM, o.bodyPosition, o.bodySize, r), B = bounds(placed);
  const st = radialStats(placed);
  const lift = PROFILE.at(-1)[1] - bounds(skin.pts).hi[1];
  log(`brain ${v3(o.bodyPosition)} size ${o.bodySize} rotation ${r.toFixed(4)} rad: rendered box ${v3(B.lo)} .. ${v3(B.hi)} size ${v3(B.s)}`);
  log(`  rendered - atlas (cm, x/y/z): centre ${B.c.map((v, k) => cm(v - BA.c[k])).join(' / ')}; size ${B.s.map((v, k) => cm(v - BA.s[k])).join(' / ')}; outline head top ${PROFILE.at(-1)[1]} - atlas skin top ${f3(bounds(skin.pts).hi[1])} = lift ${f3(lift)}; centre y - atlas centre y = ${f3(B.c[1] - BA.c[1])}`);
  log(`  vertices outside the outline lathe: ${(st.frac * 100).toFixed(1)}%, worst ${cm(st.worst)} cm`);
}
{
  const o = ORGANS.eyeball, r = rotationOf(o);
  const { globe } = splitEye(ep, EM);
  const G2 = bounds(place(globe, EM, o.bodyPosition, o.bodySize, r));
  const placed = place(ep, EM, o.bodyPosition, o.bodySize, r);
  const st = radialStats(placed);
  log(`eyeball ${v3(o.bodyPosition)} size ${o.bodySize} rotation ${r.toFixed(4)} rad: globe box ${v3(G2.lo)} .. ${v3(G2.hi)} size ${v3(G2.s)} centre ${v3(G2.c)}`);
  log(`  globe - atlas left sclera+cornea (cm, x/y/z): size ${G2.s.map((v, k) => cm(v - EA.s[k])).join(' / ')}; centre x ${cm(G2.c[0] - EA.c[0])}, y ${cm(G2.c[1] - EA.c[1])} (head lift 0.06), z ${cm(G2.c[2] - EA.c[2])} (head shift 0.01)`);
  log(`  vertices outside the outline lathe: ${(st.frac * 100).toFixed(1)}%, worst ${cm(st.worst)} cm`);
}

fs.writeFileSync(outFile, out.join('\n') + '\n', 'utf8');
