// Usage: node head-checks.mjs <medical-main dir> <output file>
// Read-only follow-up to compare-organs.mjs: which way the brain and eye models face, the atlas eye parts one by one,
// and where the atlas head sits against BodyOutline's head (PROFILE copied from src/components/sim/BodyOutline.tsx).
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
const atlasPoints = (re, system) => {
  const parts = atlas.parts.filter((p) => re.test(p.name) && (!system || p.system === system));
  const pts = [];
  for (const p of parts) {
    const buf = chunk(p.chunk);
    const pos = new Float32Array(buf.buffer.slice(buf.byteOffset + p.positions, buf.byteOffset + p.positions + p.vertexCount * 12));
    for (let v = 0; v < p.vertexCount; v++) pts.push([pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]]);
  }
  return { parts, pts };
};
const glbPoints = (file) => {
  const glb = fs.readFileSync(path.join(root, 'public', file));
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const { count, byteStride, byteOffset = 0, byteLength, mode, filter } = gltf.bufferViews[accessor.bufferView].extensions.EXT_meshopt_compression;
  const raw = new Uint8Array(count * byteStride);
  MeshoptDecoder.decodeGltfBuffer(raw, count, byteStride, glb.subarray(28 + jsonLength + byteOffset, 28 + jsonLength + byteOffset + byteLength), mode, filter);
  const view = new DataView(raw.buffer);
  const { translation = [0, 0, 0], scale = [1, 1, 1] } = gltf.nodes[0];
  if (gltf.nodes.length !== 1 || gltf.nodes[0].rotation || accessor.componentType !== 5122) throw new Error(`${file}: unexpected layout`);
  return Array.from({ length: count }, (_, i) => [0, 1, 2].map((k) =>
    Math.max(view.getInt16((accessor.byteOffset ?? 0) + i * byteStride + 2 * k, true) / 32767, -1) * scale[k] + translation[k]));
};
const f3 = (v) => v.toFixed(3);
const box = (B) => `[${B.lo.map(f3)}] .. [${B.hi.map(f3)}]`;

// 1. Lowest band (brainstem + cerebellum) of a brain: centroid offset from the box centre, as a fraction of the half size.
//    Upright brain facing +Z: x about 0, z clearly negative (the back). Front-back axis lying along X: the offset shows in x.
const lowBand = (pts, frac) => {
  const B = bounds(pts);
  const sel = pts.filter((p) => p[1] < B.lo[1] + frac * B.s[1]);
  const mean = (k) => sel.reduce((a, p) => a + p[k], 0) / sel.length;
  return `lowest ${frac * 100}% of height (${sel.length} points): x ${((mean(0) - B.c[0]) / (B.s[0] / 2)).toFixed(2)}, z ${((mean(2) - B.c[2]) / (B.s[2] / 2)).toFixed(2)}`;
};
log('Read-only orientation and head checks (metres; +X patient left, +Y up, +Z front).');
log('\n== 1. Brain: which way is the back? (centroid of the lowest band, fraction of half size from box centre)');
const BRAIN = /gyrus|occipital lobe|parietal lobule|insula|White matter of|Corpus callosum|^Cerebellum$|^Pons$|Medulla oblongata|^Midbrain$|Peduncle of midbrain|thalamus$|^Hypothalamus$|hippocampus|amygdala|caudate nucleus|putamen|globus pallidus|internal capsule|fornix of forebrain|colliculus$|geniculate body/;
const brainAtlas = atlasPoints(BRAIN, 'nervous').pts, brainModel = glbPoints(ORGANS.brain.glb);
for (const frac of [0.1, 0.25]) {
  log(`  atlas: ${lowBand(brainAtlas, frac)}`);
  log(`  model: ${lowBand(brainModel, frac)}`);
}
const cerebellum = bounds(atlasPoints(/^Cerebellum$/).pts);
log(`  atlas Cerebellum box ${box(cerebellum)} (behind the brain centre in z, as expected)`);

// 2. Eye: cross-section along each axis near both ends. A cornea is a wide dome centred on the axis;
//    an optic nerve is a narrow tube, usually off-centre.
log('\n== 2. Eye: end slices per axis (40 slices; width = widest cross extent / widest box side; offsets = centroid of the slice from the box centre, fraction of half size)');
const eyeModel = glbPoints(ORGANS.eyeball.glb);
const profile = (pts, a, n = 40) => {
  const B = bounds(pts);
  const [b, c] = [0, 1, 2].filter((k) => k !== a);
  const rows = Array.from({ length: n }, () => ({ lo: [Infinity, Infinity], hi: [-Infinity, -Infinity], sum: [0, 0], n: 0 }));
  for (const p of pts) {
    const r = rows[Math.min(n - 1, Math.floor(((p[a] - B.lo[a]) / B.s[a]) * n))];
    [b, c].forEach((k, j) => { r.lo[j] = Math.min(r.lo[j], p[k]); r.hi[j] = Math.max(r.hi[j], p[k]); r.sum[j] += p[k]; });
    r.n++;
  }
  const axis = 'xyz';
  return rows.map((r, i) => r.n ? `${axis[a]} slice ${String(i).padStart(2)}: width ${(Math.max(r.hi[0] - r.lo[0], r.hi[1] - r.lo[1]) / Math.max(B.s[b], B.s[c])).toFixed(2)}, ` +
    `${axis[b]} ${((r.sum[0] / r.n - B.c[b]) / (B.s[b] / 2)).toFixed(2)}, ${axis[c]} ${((r.sum[1] / r.n - B.c[c]) / (B.s[c] / 2)).toFixed(2)}, ${r.n} points` : `${axis[a]} slice ${i}: empty`);
};
for (const a of [0, 1, 2]) {
  const rows = profile(eyeModel, a);
  log(`  model ${'xyz'[a]} axis, low end:  ${rows.slice(0, 4).join(' | ')}`);
  log(`  model ${'xyz'[a]} axis, high end: ${rows.slice(36).join(' | ')}`);
}
log('  atlas eye parts:');
for (const p of atlas.parts.filter((q) => /^(Left|Right) (sclera|cornea)$/.test(q.name))) {
  const B = bounds(atlasPoints(new RegExp(`^${p.name}$`)).pts);
  log(`    ${p.name.padEnd(13)} box ${box(B)}  centre [${B.c.map(f3)}]  size [${B.s.map(f3)}]  (listed bounds [${p.bounds[0].map(f3)}] .. [${p.bounds[1].map(f3)}])`);
}

// 3. Atlas head against BodyOutline's lathe profile.
log('\n== 3. Head: atlas skin against BodyOutline (lathe, so its radius applies to both width and depth)');
const PROFILE = [[0.001, 0.0], [0.09, 0.015], [0.115, 0.06], [0.12, 0.12], [0.105, 0.4], [0.125, 0.52], [0.125, 0.82], [0.155, 0.93],
  [0.17, 0.99], [0.155, 1.08], [0.15, 1.16], [0.168, 1.28], [0.185, 1.36], [0.15, 1.46], [0.075, 1.52], [0.06, 1.56], [0.085, 1.62],
  [0.1, 1.7], [0.07, 1.76], [0.001, 1.78]];
const outlineR = (y) => {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1], [r1, y1] = PROFILE[i];
    if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return 0;
};
const skin = atlasPoints(/^Skin$/).pts;
const rows = [];
for (let y = 1.30; y <= 1.725; y += 0.01) {
  const sel = skin.filter((p) => Math.abs(p[1] - y) < 0.005);
  if (!sel.length) continue;
  const B = bounds(sel);
  rows.push({ y, halfX: Math.max(-B.lo[0], B.hi[0]), z: [B.lo[2], B.hi[2]], r: outlineR(y) });
}
log('  y      outline r   atlas half-width x   atlas z range (half-depth)');
for (const r of rows) log(`  ${r.y.toFixed(2)}   ${f3(r.r)}       ${f3(r.halfX)}               ${f3(r.z[0])} .. ${f3(r.z[1])} (${f3((r.z[1] - r.z[0]) / 2)})`);
const neck = rows.filter((r) => r.y >= 1.44 && r.y <= 1.62).reduce((a, r) => (r.halfX < a.halfX ? r : a));
const head = rows.filter((r) => r.y >= 1.56).reduce((a, r) => (r.halfX > a.halfX ? r : a));
const skinTop = bounds(skin).hi[1];
log(`  atlas: skin top ${f3(skinTop)}; narrowest neck ${neck.y.toFixed(2)} (half-width ${f3(neck.halfX)}); widest head ${head.y.toFixed(2)} (half-width ${f3(head.halfX)})`);
log('  outline: top 1.780; narrowest neck 1.56 (r 0.060); widest head 1.70 (r 0.100)');
for (const name of ['Mandible', 'Frontal bone', 'Occipital bone', 'Hyoid bone', 'Left clavicle', 'Right clavicle', 'Left scapula', 'Manubrium of sternum']) {
  const p = atlas.parts.find((q) => q.name === name);
  log(`  atlas ${name}: ${p ? `y ${f3(p.bounds[0][1])} .. ${f3(p.bounds[1][1])}` : 'not in atlas'}`);
}
for (const id of ['brain', 'eyeball']) {
  const { bodyPosition: [x, y, z], bodySize } = ORGANS[id];
  log(`  current ${id}: bodyPosition [${x}, ${y}, ${z}], bodySize ${bodySize}`);
}
fs.writeFileSync(outFile, out.join('\n') + '\n');
