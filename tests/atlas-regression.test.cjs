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
