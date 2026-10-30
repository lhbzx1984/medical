// 从精细人体图谱（BodyParts3D 4.0 经简化）中抽取胃 FJ2564，写成自包含 GLB：public/models/stomach.glb
// 用法：node scripts/extract-stomach-glb.mjs [项目根目录]
//
// 只做格式转换，不改解剖形状：
//   - 顶点位置和三角形索引原样读取（坐标仍是图谱坐标，单位米；OrganModel 加载时会居中并缩放）
//   - 图谱里存储的法线与三角形绕向相反（实测约 99.8% 不一致），不能直接使用，
//     这里按三角形绕向重新计算面积加权的顶点法线并单位化
//   - 脚本会用有符号体积确认绕向朝外，否则翻转索引
// 来源与改动声明写入 GLB 的 asset.copyright / asset.extras。
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const atlas = JSON.parse(readFileSync(path.join(root, "public/atlas/atlas.json"), "utf8"));
const part = atlas.parts.find((p) => p.id === "FJ2564");
if (!part || part.name !== "Stomach" || part.conceptId !== "FMA7148") throw new Error("图谱中没有预期的胃 FJ2564");

const gz = readFileSync(path.join(root, `public/atlas/body-${part.chunk}.bin.gz`));
const raw = gunzipSync(gz);
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const vc = part.vertexCount;
const ic = part.indexCount;
const positions = new Float32Array(buf.slice(part.positions, part.positions + vc * 12));
const indices = new Uint32Array(buf.slice(part.indices, part.indices + ic * 4));

for (const v of positions) if (!Number.isFinite(v)) throw new Error("存在非有限坐标");
for (const i of indices) if (i >= vc) throw new Error("索引越界");
if (ic % 3 !== 0) throw new Error("索引数不是 3 的倍数");

// 有符号体积：为正表示绕向朝外
const signedVolume = () => {
  let vol = 0;
  for (let t = 0; t < ic; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    vol += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return vol / 6;
};
let flipped = false;
if (signedVolume() < 0) {
  for (let t = 0; t < ic; t += 3) { const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp; }
  flipped = true;
}
const volume = signedVolume();
if (!(volume > 0)) throw new Error("无法得到朝外的绕向");

const normals = new Float32Array(vc * 3);
for (let t = 0; t < ic; t += 3) {
  const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
  const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
  const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz; }
}
for (let i = 0; i < vc; i++) {
  const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1;
  normals[i * 3] /= l; normals[i * 3 + 1] /= l; normals[i * 3 + 2] /= l;
}

const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vc; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i * 3 + k]); max[k] = Math.max(max[k], positions[i * 3 + k]); }

const posB = Buffer.from(positions.buffer), norB = Buffer.from(normals.buffer), idxB = Buffer.from(indices.buffer);
const bin = Buffer.concat([posB, norB, idxB]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const copyright = "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International";
const gltf = {
  asset: {
    version: "2.0",
    generator: "MedPlan Atlas scripts/extract-stomach-glb.mjs",
    copyright,
    extras: {
      source: "BodyParts3D 4.0 via public/atlas (FJ2564, FMA7148, chunk " + part.chunk + ")",
      scope: atlas.scope,
      simplification: atlas.optimized,
      changes: "格式转换为 GLB；按三角形绕向重新计算法线；" + (flipped ? "翻转了索引绕向；" : "未翻转绕向；") + "几何形状与坐标未改动",
      inputSha256: { "atlas.json": sha(readFileSync(path.join(root, "public/atlas/atlas.json"))), [`body-${part.chunk}.bin.gz`]: sha(gz) },
      notice: "男性参考解剖的简化网格，仅供教学示意，不是个体或女性胃，也不是医学审核过的数据",
    },
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: "Stomach_FJ2564", mesh: 0 }],
  meshes: [{ name: "Stomach", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: "stomach", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.45, 0.42, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: vc, type: "VEC3", min, max },
    { bufferView: 1, componentType: 5126, count: vc, type: "VEC3" },
    { bufferView: 2, componentType: 5125, count: ic, type: "SCALAR" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posB.length, target: 34962 },
    { buffer: 0, byteOffset: posB.length, byteLength: norB.length, target: 34962 },
    { buffer: 0, byteOffset: posB.length + norB.length, byteLength: idxB.length, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};

const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
const binPadded = pad(bin, 0);
const header = Buffer.alloc(12);
header.write("glTF", 0, "ascii"); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const chunk = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.write(type, 4, "ascii"); return h; };
const glb = Buffer.concat([header, chunk(json.length, "JSON"), json, chunk(binPadded.length, "BIN\0"), binPadded]);

const out = path.join(root, "public/models/stomach.glb");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, glb);
console.log(JSON.stringify({ out, bytes: glb.length, vertices: vc, triangles: ic / 3, signedVolumeM3: volume, flipped, sha256: sha(glb) }));
