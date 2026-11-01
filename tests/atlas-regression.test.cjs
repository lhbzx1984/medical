const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const THREE = require('three');
const { loadTs } = require('./load-ts.cjs');

test('atlas metadata recovers after a temporary request failure', async () => {
  delete globalThis.__atlasJson;
  const originalFetch = globalThis.fetch;
  const { loadAtlasJson } = loadTs('src/components/atlas/atlasData.ts');
  try {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('temporary network outage'); };
    await assert.rejects(loadAtlasJson(), /temporary/);
    globalThis.fetch = async () => { calls++; return Response.json({ parts: [], chunks: [] }); };
    const recovered = await loadAtlasJson();
    assert.equal(recovered.parts.length, 0);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__atlasJson; }
});

test('atlas chunk retries a failed request and decompresses the successful response', async () => {
  delete globalThis.__atlasChunks;
  const originalFetch = globalThis.fetch;
  const { loadChunkBuffer } = loadTs('src/components/atlas/atlasData.ts');
  try {
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(loadChunkBuffer(0), /503/);
    globalThis.fetch = async () => new Response(zlib.gzipSync(Buffer.from([1, 2, 3])));
    assert.deepEqual([...new Uint8Array(await loadChunkBuffer(0))], [1, 2, 3]);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__atlasChunks; }
});

test('atlas pointer picking ignores hidden front structure and follows exploded structure', () => {
  const data = loadTs('src/components/atlas/atlasData.ts');
  assert.equal(typeof data.createAtlasRaycast, 'function', 'atlas picking must apply visible state and explode offsets');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1,-1,1, 1,-1,1, 0,1,1, -1,-1,0, 1,-1,0, 0,1,0
  ], 3));
  geometry.setAttribute('partId', new THREE.Uint16BufferAttribute([0,0,0,1,1,1],1));
  geometry.setIndex([0,1,2,3,4,5]);
  const parts = [
    {chunk:0,indexCount:3,bounds:[[-1,-1,1],[1,1,1]]},
    {chunk:0,indexCount:3,bounds:[[-1,-1,0],[1,1,0]]}
  ];
  const state = new Float32Array([0,0,0,1, 1,0,0,1]);
  const offsets = new Float32Array([0,0,0,0, 3,0,0,0]);
  let explode = 0;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.raycast = data.createAtlasRaycast(parts,0,state,offsets,()=>explode);
  mesh.updateMatrixWorld();
  let ray = new THREE.Raycaster(new THREE.Vector3(0,0,3),new THREE.Vector3(0,0,-1));
  let hits = ray.intersectObject(mesh);
  assert.equal(hits.length,1);
  assert.equal(hits[0].face.a,3);
  assert.equal(hits[0].object,mesh);
  explode = 1;
  assert.equal(ray.intersectObject(mesh).length,0);
  ray = new THREE.Raycaster(new THREE.Vector3(3,0,3),new THREE.Vector3(0,0,-1));
  hits = ray.intersectObject(mesh);
  assert.equal(hits.length,1);
  assert.equal(hits[0].face.a,3);
  assert.deepEqual(geometry.drawRange,{start:0,count:Infinity});
  geometry.dispose();mesh.material.dispose();
});

test('overview organ x positions match their atlas structures (+X is the patient left)', () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const { parts } = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/atlas/atlas.json'), 'utf8'));
  // OrganModel centres each model on bodyPosition by bounding box, so compare with the atlas bounding-box centre.
  const atlasX = (re) => {
    const hits = parts.filter((p) => re.test(p.name));
    assert.ok(hits.length, `no atlas structure matches ${re}`);
    return (Math.min(...hits.map((p) => p.bounds[0][0])) + Math.max(...hits.map((p) => p.bounds[1][0]))) / 2;
  };
  const off = [
    ['liver', /^(Hepatovenous segment|Caudate lobe of liver$)/],
    ['heart', /^(Cavity|Wall) of (left|right) (ventricle|atrium)$/],
    ['stomach', /^Stomach$/],
  ].map(([id, re]) => [id, ORGANS[id].bodyPosition[0], +atlasX(re).toFixed(3)])
    .filter(([, x, atlas]) => Math.abs(x - atlas) > 0.01);
  assert.deepEqual(off, []);
});

test('overview liver body matches the atlas liver in centre and longest side (vessel stub left out)', async () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const { parts } = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/atlas/atlas.json'), 'utf8'));
  const segments = parts.filter((p) => /^(Hepatovenous segment|Caudate lobe of liver$)/.test(p.name));
  const atlas = [0, 1, 2].map((k) => [Math.min(...segments.map((p) => p.bounds[0][k])), Math.max(...segments.map((p) => p.bounds[1][k]))]);
  // Decode liver.glb positions (meshopt, int16 quantisation, node transform): the box OrganModel normalises.
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  await MeshoptDecoder.ready;
  const glb = fs.readFileSync(path.join(__dirname, '../public/models/liver.glb'));
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const { count, byteStride, byteOffset = 0, byteLength, mode, filter } = gltf.bufferViews[accessor.bufferView].extensions.EXT_meshopt_compression;
  const raw = new Uint8Array(count * byteStride);
  MeshoptDecoder.decodeGltfBuffer(raw, count, byteStride, glb.subarray(28 + jsonLength + byteOffset, 28 + jsonLength + byteOffset + byteLength), mode, filter);
  const view = new DataView(raw.buffer);
  const { translation, scale } = gltf.nodes[0];
  const points = Array.from({ length: count }, (_, i) => [0, 1, 2].map((k) =>
    Math.max(view.getInt16((accessor.byteOffset ?? 0) + i * byteStride + 2 * k, true) / 32767, -1) * scale[k] + translation[k]));
  const bounds = (pts) => [0, 1, 2].map((k) => pts.reduce(([lo, hi], p) => [Math.min(lo, p[k]), Math.max(hi, p[k])], [Infinity, -Infinity]));
  const box = bounds(points);
  // The model carries vessel stubs (vena cava, an artery) above the liver: height slices narrower than a third of its width are vessel, not liver.
  const row = (p) => Math.min(39, Math.floor(((p[1] - box[1][0]) / (box[1][1] - box[1][0])) * 40));
  const widths = Array.from({ length: 40 }, () => [Infinity, -Infinity]);
  for (const p of points) { const w = widths[row(p)]; w[0] = Math.min(w[0], p[0]); w[1] = Math.max(w[1], p[0]); }
  const liverRows = widths.flatMap(([lo, hi], i) => (hi - lo > (box[0][1] - box[0][0]) / 3 ? [i] : []));
  const body = bounds(points.filter((p) => row(p) >= liverRows[0] && row(p) <= liverRows.at(-1)));
  // OrganModel centres the whole box on bodyPosition and scales its longest side to bodySize.
  const s = ORGANS.liver.bodySize / Math.max(...box.map(([lo, hi]) => hi - lo));
  const centre = body.map(([lo, hi], k) => +(ORGANS.liver.bodyPosition[k] + ((lo + hi) / 2 - (box[k][0] + box[k][1]) / 2) * s).toFixed(3));
  const longest = +(Math.max(...body.map(([lo, hi]) => hi - lo)) * s).toFixed(3);
  const atlasCentre = atlas.map(([lo, hi]) => +((lo + hi) / 2).toFixed(3));
  const atlasLongest = +Math.max(...atlas.map(([lo, hi]) => hi - lo)).toFixed(3);
  assert.ok(centre.every((v, k) => Math.abs(v - atlasCentre[k]) <= 0.01) && Math.abs(longest - atlasLongest) <= 0.01,
    `liver body centre ${centre}, longest side ${longest}; atlas centre ${atlasCentre}, longest side ${atlasLongest}`);
});

test('overview kidneys and pancreas match their atlas structures in centre and longest side (ureter stubs left out)', async () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const { parts } = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/atlas/atlas.json'), 'utf8'));
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  await MeshoptDecoder.ready;
  const bounds = (pts) => [0, 1, 2].map((k) => pts.reduce(([lo, hi], p) => [Math.min(lo, p[k]), Math.max(hi, p[k])], [Infinity, -Infinity]));
  // The kidney model hangs ureter stubs below the kidneys, which the atlas kidneys leave out. The narrow lower part of
  // the pancreas model is its head, which the atlas pancreas has too, so that model is compared whole.
  const off = [];
  for (const [id, re, stubsBelow] of [['kidneys', /^(Left|Right) kidney$/, true], ['pancreas', /^Pancreas$/, false]]) {
    const hits = parts.filter((p) => re.test(p.name));
    const atlas = [0, 1, 2].map((k) => [Math.min(...hits.map((p) => p.bounds[0][k])), Math.max(...hits.map((p) => p.bounds[1][k]))]);
    const glb = fs.readFileSync(path.join(__dirname, '../public', ORGANS[id].glb));
    const jsonLength = glb.readUInt32LE(12);
    const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
    const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
    const { count, byteStride, byteOffset = 0, byteLength, mode, filter } = gltf.bufferViews[accessor.bufferView].extensions.EXT_meshopt_compression;
    const raw = new Uint8Array(count * byteStride);
    MeshoptDecoder.decodeGltfBuffer(raw, count, byteStride, glb.subarray(28 + jsonLength + byteOffset, 28 + jsonLength + byteOffset + byteLength), mode, filter);
    const view = new DataView(raw.buffer);
    const { translation, scale } = gltf.nodes[0];
    const points = Array.from({ length: count }, (_, i) => [0, 1, 2].map((k) =>
      Math.max(view.getInt16((accessor.byteOffset ?? 0) + i * byteStride + 2 * k, true) / 32767, -1) * scale[k] + translation[k]));
    const box = bounds(points);
    let body = box;
    if (stubsBelow) {
      // Height slices narrower than a third of the model width are ureter, not kidney (as with the liver's vessel stubs).
      const row = (p) => Math.min(39, Math.floor(((p[1] - box[1][0]) / (box[1][1] - box[1][0])) * 40));
      const widths = Array.from({ length: 40 }, () => [Infinity, -Infinity]);
      for (const p of points) { const w = widths[row(p)]; w[0] = Math.min(w[0], p[0]); w[1] = Math.max(w[1], p[0]); }
      const kidneyRows = widths.flatMap(([lo, hi], i) => (hi - lo > (box[0][1] - box[0][0]) / 3 ? [i] : []));
      body = bounds(points.filter((p) => row(p) >= kidneyRows[0] && row(p) <= kidneyRows.at(-1)));
    }
    // OrganModel centres the whole box on bodyPosition and scales its longest side to bodySize.
    const s = ORGANS[id].bodySize / Math.max(...box.map(([lo, hi]) => hi - lo));
    const centre = body.map(([lo, hi], k) => +(ORGANS[id].bodyPosition[k] + ((lo + hi) / 2 - (box[k][0] + box[k][1]) / 2) * s).toFixed(3));
    const longest = +(Math.max(...body.map(([lo, hi]) => hi - lo)) * s).toFixed(3);
    const atlasCentre = atlas.map(([lo, hi]) => +((lo + hi) / 2).toFixed(3));
    const atlasLongest = +Math.max(...atlas.map(([lo, hi]) => hi - lo)).toFixed(3);
    if (!centre.every((v, k) => Math.abs(v - atlasCentre[k]) <= 0.01) || Math.abs(longest - atlasLongest) > 0.01)
      off.push(`${id} centre ${centre}, longest side ${longest}; atlas centre ${atlasCentre}, longest side ${atlasLongest}`);
  }
  assert.deepEqual(off, []);
});

test('overview uses independently aligned kidneys with atlas-consistent laterality and height', async () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const { parts } = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/atlas/atlas.json'), 'utf8'));
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const kidneys = ORGANS.kidneys.bodyParts;
  assert.equal(kidneys?.length, 2, 'the overview needs two separately positioned models');
  const [left, right] = kidneys;
  assert.notEqual(left.glb, right.glb);
  for (const [part, side] of [[left, 'Left'], [right, 'Right']]) {
    const atlas = parts.find((p) => p.name === `${side} kidney`);
    assert.ok(atlas, `${side} kidney is missing from the atlas`);
    const centre = atlas.bounds[0].map((v, i) => (v + atlas.bounds[1][i]) / 2);
    const longest = Math.max(...atlas.bounds[0].map((v, i) => atlas.bounds[1][i] - v));
    assert.ok(part.position.every((v, i) => Math.abs(v - centre[i]) < 0.001), `${side} kidney centre differs from atlas`);
    assert.ok(Math.abs(part.size - longest) < 0.001, `${side} kidney size differs from atlas`);
    const bytes = fs.readFileSync(path.join(__dirname, '../public', part.glb));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    assert.ok(!box.isEmpty() && size.y > size.x && size.y > size.z, `${side} model must have a vertical kidney shape`);
  }
  assert.ok(left.position[0] > 0 && right.position[0] < 0, '+X is the patient left');
  assert.ok(Math.abs((left.position[1] - right.position[1]) - 0.018) < 0.002, 'the right kidney should be lower');
});

test('reference bodies share the atlas standing coordinate system', async () => {
  const { fitReferenceBody, REFERENCE_BODY_HEIGHT } = loadTs('src/lib/reference-body.ts');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const load = async (file) => {
    const bytes = fs.readFileSync(path.join(__dirname, `../public/models/${file}`));
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  };
  // The organ registry is in the atlas frame, so the shared body height is the atlas skin top.
  const atlasSkinTop = Math.max(...JSON.parse(fs.readFileSync(path.join(__dirname, '../public/atlas/atlas.json'), 'utf8')).parts
    .filter((p) => p.name === 'Skin').map((p) => p.bounds[1][1]));
  assert.ok(Math.abs(REFERENCE_BODY_HEIGHT - atlasSkinTop) < 0.001, `body height ${REFERENCE_BODY_HEIGHT}, atlas skin top ${atlasSkinTop}`);
  // Female: the HuBMAP body is fitted to that height, standing on y=0 and centred on x/z.
  const female = new THREE.Box3().setFromObject((await load('hra-skin-female.glb')).scene);
  assert.ok(!female.isEmpty(), 'female body model must contain geometry');
  const fit = fitReferenceBody(female.min.toArray(), female.max.toArray());
  assert.ok(Math.abs((female.min.y + fit.position[1]) * fit.scale) < 1e-6);
  assert.ok(Math.abs((female.max.y + fit.position[1]) * fit.scale - REFERENCE_BODY_HEIGHT) < 1e-6);
  assert.ok(Math.abs(((female.min.x + female.max.x) / 2 + fit.position[0]) * fit.scale) < 1e-6);
  assert.throws(() => fitReferenceBody([0,0,0], [1,0,1]), /Invalid/);
  // Male: the BodyParts3D skin is already in the atlas frame and is used as it is (feet on y=0, top at the atlas skin top).
  const skin = new THREE.Box3().setFromObject((await load('bp3d-skin-male.glb')).scene.getObjectByName('Skin'));
  assert.ok(Math.abs(skin.min.y) < 0.005 && Math.abs(skin.max.y - REFERENCE_BODY_HEIGHT) < 0.002, `male skin spans y ${skin.min.y}..${skin.max.y}`);
  assert.ok(Math.abs((skin.min.x + skin.max.x) / 2) < 0.01, 'male skin is centred on the atlas midline');
});

test('supplementary reference organs have valid geometry near their recorded centers', async () => {
  const { EXTRA_ORGAN_LIST } = loadTs('src/lib/extra-organs.ts');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  for (const organ of EXTRA_ORGAN_LIST) for (const sex of ['male', 'female']) {
    const paths = organ.files[sex]; if (!paths) continue;
    const combined = new THREE.Box3();
    for (const file of paths) {
      const bytes = fs.readFileSync(path.join(__dirname, '../public', file));
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      const box = new THREE.Box3().setFromObject(gltf.scene);
      assert.ok(!box.isEmpty(), `${file} must contain geometry`); combined.union(box);
    }
    const center = combined.getCenter(new THREE.Vector3()).toArray();
    assert.ok(center.every((n, i) => Math.abs(n - organ.centers[sex][i]) < 0.012), `${organ.id} ${sex} center mismatch: ${center}`);
  }
});

// Lungs, brain and eyeball (mackdown.md section 6). Helpers shared by the three tests below.
const atlasParts = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../public/atlas/atlas.json'), 'utf8')).parts;
/** Union of the bounds of the atlas structures whose name (and, if given, system) matches. */
function atlasBox(parts, re, system) {
  const hits = parts.filter((p) => re.test(p.name) && (!system || p.system === system));
  assert.ok(hits.length, `no atlas structure matches ${re}`);
  return [0, 1, 2].map((k) => [Math.min(...hits.map((p) => p.bounds[0][k])), Math.max(...hits.map((p) => p.bounds[1][k]))]);
}
const boundsOf = (pts) => [0, 1, 2].map((k) => pts.reduce(([lo, hi], p) => [Math.min(lo, p[k]), Math.max(hi, p[k])], [Infinity, -Infinity]));
const centreOf = (box) => box.map(([lo, hi]) => (lo + hi) / 2);
const sizeOf = (box) => box.map(([lo, hi]) => hi - lo);
/** Vertex positions of a single-mesh GLB: Meshopt (int16 quantisation + node transform) as in the tests above, or plain Float32. */
async function glbPoints(file) {
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  await MeshoptDecoder.ready;
  const glb = fs.readFileSync(path.join(__dirname, '../public', file));
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const { translation = [0, 0, 0], scale = [1, 1, 1] } = gltf.nodes[0];
  if (!bufferView.extensions?.EXT_meshopt_compression) {
    assert.equal(accessor.componentType, 5126, `${file}: positions are neither Meshopt nor Float32`);
    const start = glb.byteOffset + 28 + jsonLength + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const floats = new Float32Array(glb.buffer.slice(start, start + accessor.count * 12));
    return Array.from({ length: accessor.count }, (_, i) => [0, 1, 2].map((k) => floats[i * 3 + k] * scale[k] + translation[k]));
  }
  const { count, byteStride, byteOffset = 0, byteLength, mode, filter } = bufferView.extensions.EXT_meshopt_compression;
  const raw = new Uint8Array(count * byteStride);
  MeshoptDecoder.decodeGltfBuffer(raw, count, byteStride, glb.subarray(28 + jsonLength + byteOffset, 28 + jsonLength + byteOffset + byteLength), mode, filter);
  const view = new DataView(raw.buffer);
  return Array.from({ length: count }, (_, i) => [0, 1, 2].map((k) =>
    Math.max(view.getInt16((accessor.byteOffset ?? 0) + i * byteStride + 2 * k, true) / 32767, -1) * scale[k] + translation[k]));
}
/** The overview placement: world = bodyPosition + R_y(bodyRotation) * (scale * (point - GLB box centre)); scale = bodySize / longest GLB side. */
function placeOverview(organ, points, box) {
  const [rx, ry, rz] = organ.bodyRotation ?? [0, 0, 0];
  assert.ok(rx === 0 && rz === 0, `${organ.id}: this helper handles rotation about Y only`);
  const s = organ.bodySize / Math.max(...sizeOf(box));
  const [cx, cy, cz] = centreOf(box);
  const [cos, sin] = [Math.cos(ry), Math.sin(ry)];
  return points.map((p) => {
    const [x, y, z] = [(p[0] - cx) * s, (p[1] - cy) * s, (p[2] - cz) * s];
    return [organ.bodyPosition[0] + x * cos + z * sin, organ.bodyPosition[1] + y, organ.bodyPosition[2] - x * sin + z * cos];
  });
}
/**
 * The body surface of the overview: the BodyParts3D male skin. It is a shell with an inner and an outer surface, so a point lies in
 * the body cavity when a ray along every axis direction meets it. The shell is open at the eyes, ears, nostrils and mouth, so a few
 * head points can look outside although they are not.
 */
async function skinShell() {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const bytes = fs.readFileSync(path.join(__dirname, '../public/models/bp3d-skin-male.glb'));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const { position, index } = (({ attributes, index }) => ({ position: attributes.position.array, index: index.array }))(gltf.scene.getObjectByName('Skin').geometry);
  const triangles = index.length / 3;
  const corners = new Float64Array(triangles * 9); // per triangle: three xyz corners
  for (let t = 0; t < triangles; t++) for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) corners[t * 9 + v * 3 + k] = position[index[t * 3 + v] * 3 + k];
  // Per axis, each triangle's bounds on the other two axes, so a ray only tests the few triangles it can meet.
  const bounds = [0, 1, 2].map((axis) => {
    const [b, c] = [(axis + 1) % 3, (axis + 2) % 3], out = new Float64Array(triangles * 4);
    for (let t = 0; t < triangles; t++) {
      const [bs, cs] = [[0, 3, 6].map((o) => corners[t * 9 + o + b]), [0, 3, 6].map((o) => corners[t * 9 + o + c])];
      out.set([Math.min(...bs), Math.max(...bs), Math.min(...cs), Math.max(...cs)], t * 4);
    }
    return out;
  });
  const crossesAlong = (p, axis, direction) => {
    const [b, c] = [(axis + 1) % 3, (axis + 2) % 3], bound = bounds[axis];
    for (let t = 0; t < triangles; t++) {
      if (p[b] < bound[t * 4] || p[b] > bound[t * 4 + 1] || p[c] < bound[t * 4 + 2] || p[c] > bound[t * 4 + 3]) continue;
      const o = t * 9;
      const [ab, ac, bb, bc, cb, cc] = [corners[o + b], corners[o + c], corners[o + 3 + b], corners[o + 3 + c], corners[o + 6 + b], corners[o + 6 + c]];
      const d = (bb - ab) * (cc - ac) - (bc - ac) * (cb - ab);
      if (Math.abs(d) < 1e-14) continue;
      const u = ((p[b] - ab) * (cc - ac) - (p[c] - ac) * (cb - ab)) / d;
      const v = ((bb - ab) * (p[c] - ac) - (bc - ac) * (p[b] - ab)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const hit = corners[o + axis] + u * (corners[o + 3 + axis] - corners[o + axis]) + v * (corners[o + 6 + axis] - corners[o + axis]);
      if ((hit - p[axis]) * direction > 0) return true;
    }
    return false;
  };
  const inside = (p) => [0, 1, 2].every((axis) => crossesAlong(p, axis, 1) && crossesAlong(p, axis, -1));
  /** Share of an evenly thinned sample (at most `max` points) of `points` inside the body cavity. */
  return { fractionInside: (points, max = 400) => {
    const sample = points.filter((_, i) => i % Math.ceil(points.length / max) === 0);
    return sample.filter(inside).length / sample.length;
  } };
}
const f3 = (box) => `${box.map((v) => v.toFixed(3))}`;

test('overview lungs fit inside the ribs and around the atlas airway trees (trachea stub left out)', async () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const parts = atlasParts();
  const ribs = atlasBox(parts, /^(Left|Right) (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) rib$/);
  const trees = atlasBox(parts, /(segmental|lingular) bronchial tree$/);
  const trachea = atlasBox(parts, /^Trachea$/);
  const points = await glbPoints(ORGANS.lungs.glb);
  const box = boundsOf(points);
  // The model carries the trachea above the lungs: height slices narrower than a third of its width are trachea, not lung.
  const row = (p) => Math.min(39, Math.floor(((p[1] - box[1][0]) / (box[1][1] - box[1][0])) * 40));
  const widths = Array.from({ length: 40 }, () => [Infinity, -Infinity]);
  for (const p of points) { const w = widths[row(p)]; w[0] = Math.min(w[0], p[0]); w[1] = Math.max(w[1], p[0]); }
  const lungRows = widths.flatMap(([lo, hi], i) => (hi - lo > (box[0][1] - box[0][0]) / 3 ? [i] : []));
  const lungs = boundsOf(placeOverview(ORGANS.lungs, points.filter((p) => row(p) >= lungRows[0] && row(p) <= lungRows.at(-1)), box));
  const top = boundsOf(placeOverview(ORGANS.lungs, points, box))[1][1];
  // The atlas has no lung mesh, so the lungs follow the structures around them: at least 1 cm inside the outer box of ribs 1-10
  // sideways and front/back with the apex not above the first rib, enclosing the segmental bronchial trees (5 mm tolerance),
  // and the model's trachea ends where the atlas trachea does (1 cm).
  const problems = [];
  for (const k of [0, 2]) {
    if (lungs[k][0] - ribs[k][0] < 0.01 || ribs[k][1] - lungs[k][1] < 0.01) problems.push(`${'xyz'[k]}: lungs ${f3(lungs[k])} are not 1 cm inside the ribs ${f3(ribs[k])}`);
  }
  if (lungs[1][1] > ribs[1][1]) problems.push(`lung apex ${lungs[1][1].toFixed(3)} is above the first rib ${ribs[1][1].toFixed(3)}`);
  for (const k of [0, 1, 2]) {
    if (trees[k][0] < lungs[k][0] - 0.005 || trees[k][1] > lungs[k][1] + 0.005) problems.push(`${'xyz'[k]}: airway trees ${f3(trees[k])} stick out of the lungs ${f3(lungs[k])}`);
  }
  if (Math.abs(top - trachea[1][1]) > 0.01) problems.push(`trachea top ${top.toFixed(3)}, atlas trachea top ${trachea[1][1].toFixed(3)}`);
  assert.deepEqual(problems, []);
});

test('overview brain faces front like the atlas brain and sits in the head of the body skin', async () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const parts = atlasParts();
  const brain = atlasBox(parts, /gyrus|occipital lobe|parietal lobule|insula|White matter of|Corpus callosum|^Cerebellum$|^Pons$|Medulla oblongata|^Midbrain$|Peduncle of midbrain|thalamus$|^Hypothalamus$|hippocampus|amygdala|caudate nucleus|putamen|globus pallidus|internal capsule|fornix of forebrain|colliculus$|geniculate body/, 'nervous');
  const cerebellum = atlasBox(parts, /^Cerebellum$/);
  const points = await glbPoints(ORGANS.brain.glb);
  const placed = placeOverview(ORGANS.brain, points, boundsOf(points));
  const rendered = boundsOf(placed);
  const problems = [];
  // The GLB's front-back axis is its x axis; turned to face front, every side matches the atlas box to 1 cm.
  sizeOf(rendered).forEach((v, k) => { if (Math.abs(v - sizeOf(brain)[k]) > 0.01) problems.push(`${'xyz'[k]} size ${v.toFixed(3)}, atlas ${sizeOf(brain)[k].toFixed(3)}`); });
  // Centre: the body is the atlas skin, so the brain sits exactly where the atlas brain is (1 cm).
  const [centre, atlasCentre] = [centreOf(rendered), centreOf(brain)];
  centre.forEach((v, k) => { if (Math.abs(v - atlasCentre[k]) > 0.01) problems.push(`${'xyz'[k]} centre ${v.toFixed(3)}, atlas ${atlasCentre[k].toFixed(3)}`); });
  // The back of the head: the atlas cerebellum lies behind the brain centre, so the lowest part of the model must sit behind it too.
  assert.ok(centreOf(cerebellum)[2] < atlasCentre[2], 'atlas cerebellum should lie behind the brain centre');
  const low = placed.filter((p) => p[1] < rendered[1][0] + 0.15 * sizeOf(rendered)[1]);
  const lowZ = low.reduce((sum, p) => sum + p[2], 0) / low.length;
  if (lowZ - centre[2] > -0.1 * sizeOf(rendered)[2] / 2) problems.push(`lowest 15% of the brain is at z ${lowZ.toFixed(3)}, not behind the centre ${centre[2].toFixed(3)}`);
  // Inside the head of the skin shell: 96% of the vertices are (the rest sit at the open ears and eye sockets); placed 6 cm too high, as
  // for the old lathe outline, only 43% would be.
  const inside = (await skinShell()).fractionInside(placed);
  if (inside < 0.93) problems.push(`only ${(inside * 100).toFixed(1)}% of the brain is inside the body skin`);
  assert.deepEqual(problems, []);
});

test('overview eyeball is the atlas left eye in size, position and orientation', async () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const parts = atlasParts();
  const sclera = atlasBox(parts, /^Left sclera$/);
  const eye = atlasBox(parts, /^Left (sclera|cornea)$/);
  const points = await glbPoints(ORGANS.eyeball.glb);
  const box = boundsOf(points);
  // The globe is every slice along the GLB's x axis from the low end up to the first slice past the peak that is narrower than 0.4 of the
  // widest cross-section; the rest of the model is the optic-nerve stub.
  const slice = (p) => Math.min(39, Math.floor(((p[0] - box[0][0]) / (box[0][1] - box[0][0])) * 40));
  const ext = Array.from({ length: 40 }, () => [Infinity, -Infinity, Infinity, -Infinity]);
  for (const p of points) { const e = ext[slice(p)]; e[0] = Math.min(e[0], p[1]); e[1] = Math.max(e[1], p[1]); e[2] = Math.min(e[2], p[2]); e[3] = Math.max(e[3], p[2]); }
  const cross = ext.map((e) => Math.max(e[1] - e[0], e[3] - e[2], 0));
  let cut = cross.indexOf(Math.max(...cross));
  while (cut < 40 && cross[cut] > 0.4 * Math.max(...cross)) cut++;
  const globe = boundsOf(placeOverview(ORGANS.eyeball, points.filter((p) => slice(p) < cut), box));
  const stub = placeOverview(ORGANS.eyeball, points.filter((p) => slice(p) >= cut), box);
  const problems = [];
  // Size: the globe is as wide and tall as the atlas sclera (2 mm) and as long front-back as sclera plus cornea (3 mm).
  const [size, atlasSize] = [sizeOf(globe), sizeOf(sclera)];
  if (Math.abs(size[0] - atlasSize[0]) > 0.002 || Math.abs(size[1] - atlasSize[1]) > 0.002 || Math.abs(size[2] - sizeOf(eye)[2]) > 0.003) {
    problems.push(`globe size ${f3(size)}, atlas sclera ${f3(atlasSize)}, sclera + cornea front-back ${sizeOf(eye)[2].toFixed(3)}`);
  }
  // Position: the globe sits where the atlas left eye is (5 mm), the body being the atlas skin.
  const [centre, atlasCentre] = [centreOf(globe), centreOf(eye)];
  centre.forEach((v, k) => { if (Math.abs(v - atlasCentre[k]) > 0.005) problems.push(`${'xyz'[k]} centre ${v.toFixed(3)}, atlas ${atlasCentre[k].toFixed(3)}`); });
  // Orientation: the optic nerve leaves the left eye backwards (at least 1 cm behind the globe centre) and towards the midline.
  const stubCentre = [0, 1, 2].map((k) => stub.reduce((sum, p) => sum + p[k], 0) / stub.length);
  if (!(stubCentre[2] < centre[2] - 0.01 && stubCentre[0] < centre[0])) problems.push(`optic nerve centre ${f3(stubCentre)} is not behind and medial to the globe centre ${f3(centre)}`);
  // The cornea reaches the atlas cornea (3 mm), no further: the globe fills the opening of the skin shell at the eye.
  if (Math.abs(globe[2][1] - eye[2][1]) > 0.003) problems.push(`globe front z ${globe[2][1].toFixed(3)}, atlas cornea front ${eye[2][1].toFixed(3)}`);
  assert.deepEqual(problems, []);
});

test('overview shows both eyes, the right one mirroring the left across the midline of the body', () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const { glb, bodyParts, bodyPosition, bodySize } = ORGANS.eyeball;
  assert.equal(bodyParts.length, 2, 'one globe per eye socket of the skin');
  const [left, right] = bodyParts;
  assert.deepEqual(left.position, bodyPosition, 'the left eye is the one the label and the camera point at');
  assert.deepEqual(right.position, [-bodyPosition[0], bodyPosition[1], bodyPosition[2]]);
  assert.ok(bodyParts.every((part) => part.glb === glb && part.size === bodySize), 'both eyes are the registered eyeball at the registered size');
});

/** Vertex positions of any GLB (several nodes, plain Float32), in the GLB's own frame. */
async function scenePoints(file) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const bytes = fs.readFileSync(path.join(__dirname, '../public', file));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const points = [], vertex = new THREE.Vector3();
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) { vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld); points.push([vertex.x, vertex.y, vertex.z]); }
  });
  return points;
}
const glbNodeCount = (file) => {
  const glb = fs.readFileSync(path.join(__dirname, '../public', file));
  return JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')).nodes.length;
};

test('overview organs sit inside the body skin (the eyeball fills its opening in the skin and has its own test)', async () => {
  const { ORGANS } = loadTs('src/lib/organ-models.ts');
  const shell = await skinShell();
  const report = [];
  for (const organ of Object.values(ORGANS)) {
    if (organ.isShell || organ.procedural || organ.id === 'eyeball') continue;
    const placements = organ.bodyParts?.length
      ? organ.bodyParts.map((part) => ({ file: part.glb, placed: { id: organ.id, bodyPosition: part.position, bodySize: part.size } }))
      : [{ file: organ.glb, placed: organ }];
    const inside = [];
    for (const { file, placed } of placements) {
      const points = glbNodeCount(file) === 1 ? await glbPoints(file) : await scenePoints(file);
      inside.push(shell.fractionInside(placeOverview(placed, points, boundsOf(points)), 300));
    }
    const fraction = Math.min(...inside);
    // The intestine model is wider than the atlas bowel at the flanks (97% inside); the other organs are entirely inside.
    if (fraction < 0.95) report.push(`${organ.id}: only ${(fraction * 100).toFixed(1)}% of the vertices are inside the skin`);
  }
  assert.deepEqual(report, []);
});

test('body surface and anatomy layers are valid BodyParts3D conversions in the atlas frame', async () => {
  const { ANATOMY_LAYER_IDS, ANATOMY_LAYERS } = loadTs('src/lib/anatomy-layers.ts');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const systems = new Set(atlasParts().map((p) => p.system));
  const files = { '/models/bp3d-skin-male.glb': ['Skin', 'Eyebrow', 'Hair', 'Lip'] };
  const meshNames = { skeletal: 'Skeleton', arterial: 'Arteries', venous: 'Veins' };
  assert.deepEqual([...ANATOMY_LAYER_IDS], ['skeletal', 'arterial', 'venous']);
  for (const id of ANATOMY_LAYER_IDS) {
    assert.ok(systems.has(id), `${id} is not an atlas system`);
    files[ANATOMY_LAYERS[id].glb] = [meshNames[id]];
  }
  let body;
  for (const [url, names] of Object.entries(files)) {
    const bytes = fs.readFileSync(path.join(__dirname, '../public', url));
    assert.ok(bytes.length < 6e6, `${url} is ${(bytes.length / 1e6).toFixed(1)} MB, too heavy to load on demand`);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    assert.deepEqual(gltf.scene.children.map((child) => child.name), names, url);
    assert.match(gltf.asset.copyright, /BodyParts3D.*Attribution 4\.0/, `${url} must carry the BodyParts3D licence notice`);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(!box.isEmpty() && [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite), `${url} has no valid geometry`);
    gltf.scene.traverse((object) => { if (object.isMesh) assert.ok(object.geometry.index.count / 3 >= 500, `${url} ${object.name} is nearly empty`); });
    if (names[0] === 'Skin') body = box;
    // Skeleton and vessels lie inside the skin's outline, to a hand's width at the extremities.
    else for (let k = 0; k < 3; k++) assert.ok(box.min.getComponent(k) >= body.min.getComponent(k) - 0.02 && box.max.getComponent(k) <= body.max.getComponent(k) + 0.02, `${url} leaves the skin along ${'xyz'[k]}`);
  }
});

test('realistic skin shader patches match the installed three.js and really apply', () => {
  const { SKIN_SHADER_TARGETS, createSkinMaterial, createOrganMaterial } = loadTs('src/components/sim/realistic-materials.ts');
  const { vertexShader, fragmentShader } = THREE.ShaderLib.physical;
  for (const target of SKIN_SHADER_TARGETS.vertex) assert.ok(vertexShader.includes(target), `three.js vertex shader no longer has ${target}`);
  for (const target of SKIN_SHADER_TARGETS.fragment) assert.ok(fragmentShader.includes(target), `three.js fragment shader no longer has ${target}`);
  assert.ok(THREE.ShaderChunk.lights_physical_pars_fragment.includes(SKIN_SHADER_TARGETS.diffuse), 'the diffuse line that wraps the light changed');
  for (const glass of [false, true]) {
    const shader = { uniforms: {}, vertexShader, fragmentShader };
    createSkinMaterial({ glass }).onBeforeCompile(shader, null);
    assert.match(shader.vertexShader, /vObjPos = position;/);
    assert.match(shader.fragmentShader, /sssIrr/, 'the wrap-around lighting was not applied');
    assert.match(shader.fragmentShader, /skinH\(vObjPos\)/, 'the skin relief was not applied');
    assert.equal(/uGlassMin, uGlassMax/.test(shader.fragmentShader), glass, 'only the see-through skin gets the Fresnel alpha');
  }
  // Organs keep the colour and texture of their model and gain a wet clear coat, without touching the model's own material.
  const source = new THREE.MeshStandardMaterial({ color: '#b04030', roughness: 0.9, metalness: 0.6 });
  const organ = createOrganMaterial(source, 'liver');
  assert.ok(organ.isMeshPhysicalMaterial && organ.clearcoat > 0 && organ.metalness === 0);
  assert.equal(organ.color.getHexString(), 'b04030');
  assert.equal(source.metalness, 0.6, 'the source material must stay as it was');
  assert.ok(createOrganMaterial(new THREE.MeshBasicMaterial(), 'heart').isMeshPhysicalMaterial, 'unknown material types fall back to a plain organ colour');
});
