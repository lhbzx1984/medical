// 从精细人体图谱（BodyParts3D 4.0 经简化）抽取体表与解剖图层，写成自包含 GLB（public/models/bp3d-*-male.glb）：
//   bp3d-skin-male.glb      体表（皮肤 FJ2810、眉 FJ2812、头发 FJ2813、唇 FJ2814），不做简化
//   bp3d-skeleton-male.glb  骨骼系统（含牙），逐结构简化
//   bp3d-arteries-male.glb  动脉（不含器官内的段/支，见 INTRA_ORGAN），逐结构简化
//   bp3d-veins-male.glb     静脉（同上）
// 用法：node scripts/extract-body-layers-glb.mjs [项目根目录]
//
// 与 extract-stomach-glb.mjs 相同的原则，只做格式转换与简化，不改解剖位置：
//   - 坐标仍是图谱坐标（米，Y 向上，脚底 y=0），与 organ-models 的器官同一坐标系，所以体表与器官天然配准
//   - 图谱里存储的法线与三角形绕向相反，不直接使用；逐结构用有符号体积确认绕向朝外（否则翻转索引），
//     合并后按绕向重新计算面积加权的顶点法线
//   - 简化用 meshoptimizer（three 自带），逐结构按比例收缩并保留至少 MIN_TRIANGLES 个三角形，
//     避免小结构（指骨、牙、细小血管）被整体误差挤掉
// 来源与改动声明写入 GLB 的 asset.copyright / asset.extras。
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { MeshoptSimplifier } from "three/examples/jsm/libs/meshopt_simplifier.module.js";

const root = path.resolve(process.argv[2] ?? ".");
const atlas = JSON.parse(readFileSync(path.join(root, "public/atlas/atlas.json"), "utf8"));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const MIN_TRIANGLES = 120;
// 器官内部的段/支（肝门静脉与肝静脉的分支、肺段、肾段等）会被不透明的器官包住，只会在器官表面戳出蓝/红色的毛刺，
// 这里不进入血管图层；主干（门静脉主干、下腔静脉、肺动静脉主干、肾动静脉……）保留。
// 图谱把「肝静脉段」（Hepatovenous segment II–IX，肝段实体而不是血管）也归在静脉系统里，会在肝的位置形成一整块蓝色，同样排除。
const INTRA_ORGAN = /^Hepatovenous segment|segmental|^Tributary of (middle|left|right) hepatic vein|^(Left|Right|Middle) hepatic vein$|^(Left|Right) portal vein$|^Trunk of (left|right) portal vein|^Caudate lobe branch/i;

const LAYERS = [
  {
    file: "bp3d-skin-male.glb",
    meshes: [
      { name: "Skin", ids: ["FJ2810"], color: [0.85, 0.62, 0.52, 1] },
      { name: "Eyebrow", ids: ["FJ2812"], color: [0.16, 0.11, 0.09, 1] },
      { name: "Hair", ids: ["FJ2813"], color: [0.17, 0.11, 0.08, 1] },
      { name: "Lip", ids: ["FJ2814"], color: [0.71, 0.38, 0.35, 1] },
    ],
  },
  { file: "bp3d-skeleton-male.glb", meshes: [{ name: "Skeleton", system: "skeletal", color: [0.9, 0.85, 0.74, 1], ratio: 0.4 }] },
  { file: "bp3d-arteries-male.glb", meshes: [{ name: "Arteries", system: "arterial", exclude: INTRA_ORGAN, color: [0.7, 0.15, 0.17, 1], ratio: 0.5 }] },
  { file: "bp3d-veins-male.glb", meshes: [{ name: "Veins", system: "venous", exclude: INTRA_ORGAN, color: [0.25, 0.35, 0.65, 1], ratio: 0.5 }] },
];

await MeshoptSimplifier.ready;
const chunkCache = new Map();
const chunkGz = (i) => {
  if (!chunkCache.has(i)) {
    const gz = readFileSync(path.join(root, `public/atlas/body-${i}.bin.gz`));
    const raw = gunzipSync(gz);
    chunkCache.set(i, { gz, buf: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) });
  }
  return chunkCache.get(i);
};

const signedVolume = (positions, indices) => {
  let vol = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    vol += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      + positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return vol / 6;
};

/** 读取一个结构：校验、统一绕向朝外、（可选）简化，并丢掉简化后不再使用的顶点。 */
function readPart(part, ratio) {
  const { buf } = chunkGz(part.chunk);
  const vc = part.vertexCount, ic = part.indexCount;
  let positions = new Float32Array(buf.slice(part.positions, part.positions + vc * 12));
  let indices = new Uint32Array(buf.slice(part.indices, part.indices + ic * 4));
  for (const v of positions) if (!Number.isFinite(v)) throw new Error(`${part.id}: 存在非有限坐标`);
  for (const i of indices) if (i >= vc) throw new Error(`${part.id}: 索引越界`);
  if (ic % 3 !== 0) throw new Error(`${part.id}: 索引数不是 3 的倍数`);
  let flipped = false;
  if (signedVolume(positions, indices) < 0) {
    for (let t = 0; t < ic; t += 3) { const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp; }
    flipped = true;
  }
  const before = ic / 3;
  if (ratio && before > MIN_TRIANGLES) {
    const target = Math.max(MIN_TRIANGLES, Math.round(before * ratio)) * 3;
    const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.05);
    const remap = new Map();
    const kept = [];
    const out = new Uint32Array(simplified.length);
    for (let k = 0; k < simplified.length; k++) {
      const old = simplified[k];
      let n = remap.get(old);
      if (n === undefined) { n = kept.length; remap.set(old, n); kept.push(old); }
      out[k] = n;
    }
    const next = new Float32Array(kept.length * 3);
    kept.forEach((old, n) => { next[n * 3] = positions[old * 3]; next[n * 3 + 1] = positions[old * 3 + 1]; next[n * 3 + 2] = positions[old * 3 + 2]; });
    positions = next; indices = out;
  }
  return { positions, indices, flipped, before, after: indices.length / 3 };
}

function mergeParts(parts, ratio) {
  const items = parts.map((p) => readPart(p, ratio));
  let V = 0, I = 0;
  for (const it of items) { V += it.positions.length / 3; I += it.indices.length; }
  const positions = new Float32Array(V * 3), indices = new Uint32Array(I);
  let vo = 0, io = 0;
  for (const it of items) {
    positions.set(it.positions, vo * 3);
    for (let k = 0; k < it.indices.length; k++) indices[io + k] = it.indices[k] + vo;
    vo += it.positions.length / 3; io += it.indices.length;
  }
  const normals = new Float32Array(V * 3);
  for (let t = 0; t < I; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz; }
  }
  for (let i = 0; i < V; i++) {
    const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
    normals[i * 3] /= l; normals[i * 3 + 1] /= l; normals[i * 3 + 2] /= l;
  }
  return { positions, normals, indices, flipped: items.filter((it) => it.flipped).length, before: items.reduce((n, it) => n + it.before, 0), after: I / 3 };
}

const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);

function writeGlb(file, meshes, usedChunks, extras) {
  const views = [], accessors = [], gltfMeshes = [], nodes = [], materials = [];
  const chunks = [];
  let offset = 0;
  const push = (arr, target) => {
    const b = pad(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), 0);
    views.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target });
    chunks.push(b); offset += b.length;
    return views.length - 1;
  };
  meshes.forEach((m, i) => {
    const V = m.positions.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < V; v++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.positions[v * 3 + k]); max[k] = Math.max(max[k], m.positions[v * 3 + k]); }
    const index = V < 65536 ? new Uint16Array(m.indices) : m.indices;
    const pos = accessors.push({ bufferView: push(m.positions, 34962), componentType: 5126, count: V, type: "VEC3", min, max }) - 1;
    const nor = accessors.push({ bufferView: push(m.normals, 34962), componentType: 5126, count: V, type: "VEC3" }) - 1;
    const idx = accessors.push({ bufferView: push(index, 34963), componentType: V < 65536 ? 5123 : 5125, count: m.indices.length, type: "SCALAR" }) - 1;
    materials.push({ name: m.name.toLowerCase(), doubleSided: false, pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: 0, roughnessFactor: 0.6 } });
    gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: pos, NORMAL: nor }, indices: idx, material: i }] });
    nodes.push({ name: m.name, mesh: i });
  });
  const bin = Buffer.concat(chunks);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "MedPlan Atlas scripts/extract-body-layers-glb.mjs",
      copyright: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International",
      extras: {
        source: "BodyParts3D 4.0 via public/atlas",
        scope: atlas.scope,
        simplification: atlas.optimized,
        inputSha256: { "atlas.json": sha(readFileSync(path.join(root, "public/atlas/atlas.json"))), ...Object.fromEntries([...usedChunks].map((i) => [`body-${i}.bin.gz`, sha(chunkGz(i).gz)])) },
        notice: "男性参考解剖的简化网格，仅供教学示意，不是个体或女性解剖，也不是医学审核过的数据",
        ...extras,
      },
    },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes, meshes: gltfMeshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }],
  };
  const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii"); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.write(type, 4, "ascii"); return h; };
  const glb = Buffer.concat([header, chunk(json.length, "JSON"), json, chunk(bin.length, "BIN\0"), bin]);
  const out = path.join(root, "public/models", file);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, glb);
  return { out, bytes: glb.length, sha256: sha(glb) };
}

for (const layer of LAYERS) {
  const usedChunks = new Set();
  const built = [], report = [];
  for (const m of layer.meshes) {
    const parts = m.ids
      ? m.ids.map((id) => { const p = atlas.parts.find((q) => q.id === id); if (!p) throw new Error(`图谱中没有 ${id}`); return p; })
      : atlas.parts.filter((p) => p.system === m.system && !(m.exclude && m.exclude.test(p.name)));
    if (!parts.length) throw new Error(`${m.name}: 没有结构`);
    parts.forEach((p) => usedChunks.add(p.chunk));
    const merged = mergeParts(parts, m.ratio);
    built.push({ name: m.name, color: m.color, ...merged });
    report.push({ mesh: m.name, structures: parts.length, trianglesBefore: merged.before, trianglesAfter: merged.after, windingFlipped: merged.flipped });
  }
  const info = writeGlb(layer.file, built, usedChunks, {
    changes: "格式转换为 GLB；统一朝外绕向并重新计算法线；" + (layer.meshes.some((m) => m.ratio) ? "逐结构 meshoptimizer 简化；" : "未简化；") + "坐标未改动",
    structures: report,
  });
  console.log(JSON.stringify({ ...info, report }));
}
