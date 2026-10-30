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
