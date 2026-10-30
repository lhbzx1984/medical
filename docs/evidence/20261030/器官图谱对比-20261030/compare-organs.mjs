// Usage: node compare-organs.mjs <medical-main dir> <output dir>
// Read-only: compares each overview organ as OrganModel places it (GLB box centred on bodyPosition, longest side scaled to
// bodySize) with the union of its BodyParts3D atlas structures. Writes report.txt and comparison.json to <output dir>.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [root, outDir] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const { loadTs } = require(path.join(root, 'tests/load-ts.cjs'));
const { ORGANS } = loadTs('src/lib/organ-models.ts');
const { MeshoptDecoder } = await import(pathToFileURL(path.join(root, 'node_modules/three/examples/jsm/libs/meshopt_decoder.module.js')).href);
await MeshoptDecoder.ready;
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'public/atlas/atlas.json'), 'utf8'));

const BRAIN = /gyrus|occipital lobe|parietal lobule|insula|White matter of|Corpus callosum|^Cerebellum$|^Pons$|Medulla oblongata|^Midbrain$|Peduncle of midbrain|thalamus$|^Hypothalamus$|hippocampus|amygdala|caudate nucleus|putamen|globus pallidus|internal capsule|fornix of forebrain|colliculus$|geniculate body/;
const SETS = {
  lungs: { label: 'airways (trachea, main bronchi, segmental trees): inner bound only, atlas has no lung mesh', re: /^(Trachea|Left main bronchus|Right main bronchus proper|.*(segmental|lingular) bronchial tree)$/ },
  lungsRibs: { label: 'ribs 1-10: outer bound of the chest', re: /^(Left|Right) (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) rib$/ },
  kidneys: { label: 'left + right kidney', re: /^(Left|Right) kidney$/ },
  pancreas: { label: 'pancreas', re: /^Pancreas$/ },
  intestine: { label: 'jejunum, ileum, appendix, ileocecal junction, colon, rectum (no duodenum; atlas has no cecum/sigmoid mesh)', re: /^((Proximal|Middle|Distal) part of (jejunum|ileum)|Appendix|Ileocecal junction|(Ascending|Transverse|Descending) colon|Rectum)$/ },
  duodenum: { label: 'duodenum (listed separately)', re: /^Duodenum$/ },
  brain: { label: 'cortex gyri/lobes, white matter, deep nuclei, cerebellum, brainstem', re: BRAIN, system: 'nervous' },
  eyeball: { label: 'left sclera + cornea (overview shows one eye, at +X = patient left)', re: /^Left (sclera|cornea)$/ },
  eyeballRight: { label: 'right sclera + cornea (reference)', re: /^Right (sclera|cornea)$/ },
  heart: { label: 'heart cavities + atrial walls (atlas has no ventricular wall mesh: underestimates the heart)', re: /^(Cavity|Wall) of (left|right) (ventricle|atrium)$/ },
  liver: { label: 'liver segments (reference, aligned)', re: /^(Hepatovenous segment|Caudate lobe of liver$)/ },
  stomach: { label: 'stomach (reference, aligned)', re: /^Stomach$/ },
};
const ROWS = [
  ['lungs', 'lungs'], ['kidneys', 'kidneys'], ['pancreas', 'pancreas'], ['intestine', 'intestine'],
  ['brain', 'brain'], ['eyeball', 'eyeball'], ['heart', 'heart'], ['liver', 'liver'], ['stomach', 'stomach'],
];

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
// Per axis: thin slices at either end (cross-section under 1/3 of the widest) = appendages such as vessels or nerves.
const endStubs = (pts, box) => [0, 1, 2].map((a) => {
  const [b, c] = [0, 1, 2].filter((k) => k !== a);
  const ext = Array.from({ length: 40 }, () => [Infinity, -Infinity, Infinity, -Infinity]);
  for (const p of pts) {
    const e = ext[Math.min(39, Math.floor(((p[a] - box.lo[a]) / box.s[a]) * 40))];
    e[0] = Math.min(e[0], p[b]); e[1] = Math.max(e[1], p[b]); e[2] = Math.min(e[2], p[c]); e[3] = Math.max(e[3], p[c]);
  }
  const w = ext.map((e) => Math.max(e[1] - e[0], e[3] - e[2], 0));
  const max = Math.max(...w);
  let lo = 0; while (lo < 40 && w[lo] < max / 3) lo++;
  let hi = 0; while (hi < 40 && w[39 - hi] < max / 3) hi++;
  return [lo, hi];
});
// Left/right halves (patient right = -X): vertical range and centre of each half.
const halves = (pts) => [(p) => p[0] < 0, (p) => p[0] >= 0].map((f) => bounds(pts.filter(f)));
// Height slices narrower than a third of the full width at either end are appendages (vessel stubs etc.), as for the liver.
const trimEnds = (pts, box) => {
  const rows = Array.from({ length: 40 }, () => [Infinity, -Infinity]);
  const row = (p) => Math.min(39, Math.floor(((p[1] - box.lo[1]) / box.s[1]) * 40));
  for (const p of pts) { const r = rows[row(p)]; if (p[0] < r[0]) r[0] = p[0]; if (p[0] > r[1]) r[1] = p[0]; }
  const wide = rows.map(([lo, hi]) => hi - lo > box.s[0] / 3);
  const first = wide.indexOf(true), last = wide.lastIndexOf(true);
  return { first, last, body: first === 0 && last === 39 ? null : bounds(pts.filter((p) => row(p) >= first && row(p) <= last)) };
};
const N = 20;
const grid = (pts, box, a, b, flipA = false) => {
  const g = new Uint8Array(N * N);
  for (const p of pts) {
    let u = (p[a] - box.lo[a]) / (box.s[a] || 1); if (flipA) u = 1 - u;
    const v = (p[b] - box.lo[b]) / (box.s[b] || 1);
    g[Math.min(N - 1, Math.floor((1 - v) * N)) * N + Math.min(N - 1, Math.floor(u * N))] = 1;
  }
  return g;
};
const iou = (g, h) => { let i = 0, u = 0; for (let k = 0; k < g.length; k++) { i += g[k] & h[k]; u += g[k] | h[k]; } return i / u; };
const ascii = (g, h) => Array.from({ length: N }, (_, r) =>
  '  ' + Array.from({ length: N }, (_, c) => (g[r * N + c] ? '#' : '.')).join('') + '    ' + Array.from({ length: N }, (_, c) => (h[r * N + c] ? '#' : '.')).join('')).join('\n');

const cm = (v) => (v * 100).toFixed(1);
const out = [], json = {};
const log = (s = '') => { out.push(s); console.log(s); };
log('Overview placement vs BodyParts3D atlas (metres; +X patient left, +Y up, +Z front). Read-only comparison.');
for (const [id, setName] of ROWS) {
  const organ = ORGANS[id];
  const set = SETS[setName];
  const { parts, pts: aPts } = atlasPoints(set);
  const A = bounds(aPts);
  const mPts = glbPoints(organ.glb);
  const M = bounds(mPts);
  const s = organ.bodySize / Math.max(...M.s);
  const render = (box) => ({ c: box.c.map((v, k) => organ.bodyPosition[k] + (v - M.c[k]) * s), s: box.s.map((v) => v * s) });
  const R = render(M);
  const trim = trimEnds(mPts, M);
  const RB = trim.body ? render(trim.body) : null;
  const front = iou(grid(mPts, M, 0, 1), grid(aPts, A, 0, 1)), frontMirror = iou(grid(mPts, M, 0, 1, true), grid(aPts, A, 0, 1));
  const side = iou(grid(mPts, M, 2, 1), grid(aPts, A, 2, 1)), sideMirror = iou(grid(mPts, M, 2, 1, true), grid(aPts, A, 2, 1));
  log(`\n== ${id}: bodyPosition [${organ.bodyPosition}], bodySize ${organ.bodySize}`);
  log(`atlas: ${set.label}; ${parts.length} meshes`);
  log(`  atlas box   centre [${A.c.map((v) => v.toFixed(3))}]  size [${A.s.map((v) => v.toFixed(3))}]  longest ${Math.max(...A.s).toFixed(3)}`);
  log(`  model box   proportions [${M.s.map((v) => (v / Math.max(...M.s)).toFixed(2))}] (atlas [${A.s.map((v) => (v / Math.max(...A.s)).toFixed(2))}])`);
  log(`  rendered    centre [${R.c.map((v) => v.toFixed(3))}]  size [${R.s.map((v) => v.toFixed(3))}]`);
  log(`  rendered - atlas: centre ${R.c.map((v, k) => cm(v - A.c[k])).join(' / ')} cm (x/y/z); size ${R.s.map((v, k) => cm(v - A.s[k])).join(' / ')} cm`);
  if (RB) log(`  model ends trimmed (slices < 1/3 width kept out: rows ${trim.first}-${trim.last} of 0-39 kept): body centre [${RB.c.map((v) => v.toFixed(3))}] size [${RB.s.map((v) => v.toFixed(3))}]; body - atlas centre ${RB.c.map((v, k) => cm(v - A.c[k])).join(' / ')} cm`);
  log(`  silhouette IoU front (x-y): as is ${front.toFixed(2)}, mirrored left-right ${frontMirror.toFixed(2)}; side (z-y): as is ${side.toFixed(2)}, mirrored front-back ${sideMirror.toFixed(2)}`);
  // Turned 90 degrees about Y: the model's side silhouette would match the atlas front one and vice versa.
  const turned = { front: Math.max(iou(grid(mPts, M, 2, 1), grid(aPts, A, 0, 1)), iou(grid(mPts, M, 2, 1, true), grid(aPts, A, 0, 1))),
    side: Math.max(iou(grid(mPts, M, 0, 1), grid(aPts, A, 2, 1)), iou(grid(mPts, M, 0, 1, true), grid(aPts, A, 2, 1))) };
  log(`  turned 90deg about Y (model side vs atlas front, model front vs atlas side, best of mirrored): front ${turned.front.toFixed(2)}, side ${turned.side.toFixed(2)}`);
  const stubs = endStubs(mPts, M);
  log(`  model thin end slices (of 40) per axis [low end, high end]: x ${stubs[0]}, y ${stubs[1]}, z ${stubs[2]}`);
  const [mr, ml] = halves(mPts.map((p) => p.map((v, k) => organ.bodyPosition[k] + (v - M.c[k]) * s))), [ar, al] = halves(aPts);
  log(`  halves (patient right | left) y range: model ${mr.lo[1].toFixed(3)}-${mr.hi[1].toFixed(3)} | ${ml.lo[1].toFixed(3)}-${ml.hi[1].toFixed(3)}; atlas ${ar.lo[1].toFixed(3)}-${ar.hi[1].toFixed(3)} | ${al.lo[1].toFixed(3)}-${al.hi[1].toFixed(3)}`);
  log('  front view (viewer left = patient right)   model | atlas');
  log(ascii(grid(mPts, M, 0, 1), grid(aPts, A, 0, 1)));
  log('  side view (left = back, right = front)     model | atlas');
  log(ascii(grid(mPts, M, 2, 1), grid(aPts, A, 2, 1)));
  json[id] = { bodyPosition: organ.bodyPosition, bodySize: organ.bodySize, atlasSet: set.label, atlasMeshes: parts.length,
    atlas: { centre: A.c, size: A.s }, modelProportions: M.s.map((v) => v / Math.max(...M.s)), rendered: R,
    renderedTrimmed: RB, iou: { front, frontMirror, side, sideMirror, turned90: turned }, thinEndSlices: stubs,
    halvesY: { model: { right: [mr.lo[1], mr.hi[1]], left: [ml.lo[1], ml.hi[1]] }, atlas: { right: [ar.lo[1], ar.hi[1]], left: [al.lo[1], al.hi[1]] } } };
}
SETS.diaphragm = { label: 'diaphragm', re: /^Diaphragm$/ };
SETS.skull = { label: 'skeleton above the neck (cranium top = head reference)', re: /./, system: 'skeletal' };
for (const extra of ['lungsRibs', 'diaphragm', 'duodenum', 'eyeballRight']) {
  const { parts, pts } = atlasPoints(SETS[extra]);
  const B = bounds(pts);
  log(`\n-- ${extra}: ${SETS[extra].label}; ${parts.length} meshes; box ${B.lo.map((v) => v.toFixed(3))} .. ${B.hi.map((v) => v.toFixed(3))}; centre [${B.c.map((v) => v.toFixed(3))}] size [${B.s.map((v) => v.toFixed(3))}]`);
  json[extra] = { atlasSet: SETS[extra].label, atlasMeshes: parts.length, lo: B.lo, hi: B.hi };
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'report.txt'), out.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'comparison.json'), JSON.stringify(json, null, 2));
