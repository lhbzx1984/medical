// BodyParts3D 4.0 人体图谱数据加载与解析（数据源自 lhbzx1984/human-atlas，CC BY 4.0）。
//
// atlas.json 结构：2234 个 Part（每个可选择的解剖结构），几何按 15 个 chunk 批次存储：
//   chunk 内每个 Part 依次排列 [positions: f32×3V][normals: u16×3V, 4字节对齐][indices: u32×I]
// 坐标单位为米、Y 轴向上，成人站立参考姿势。
"use client";

export interface AtlasPart {
  id: string;
  name: string;
  conceptId: string;
  system: string;
  chunk: number;
  positions: number;
  normals: number;
  indices: number;
  vertexCount: number;
  indexCount: number;
  bounds: [number[], number[]];
}

export interface AtlasConcept {
  id: string;
  name: string;
  elements: string[];
}

export interface AtlasJson {
  version: string;
  parts: AtlasPart[];
  concepts: AtlasConcept[];
  chunks: { url: string; bytes: number; gzip: string; gzipBytes: number }[];
  triangles: number;
}

export interface AtlasSystemInfo {
  id: string;
  nameZh: string;
  nameEn: string;
  color: string; // "#rrggbb"
  description: string;
}

// 15 大解剖系统（沿用 human-atlas 的配色，中文名为本系统翻译）
export const ATLAS_SYSTEMS: AtlasSystemInfo[] = [
  { id: "skeletal", nameZh: "骨骼", nameEn: "Skeleton", color: "#e2d9ba", description: "骨构成身体的支撑框架，保护器官并为肌肉提供附着点；骨内组织还储存矿物质并造血。" },
  { id: "muscular", nameZh: "肌肉", nameEn: "Muscles", color: "#a85b50", description: "骨骼肌通过牵拉附着点产生运动，维持关节稳定与姿势，并产生热量。" },
  { id: "cardiac", nameZh: "心脏", nameEn: "Heart", color: "#b96760", description: "四腔肌性泵，瓣膜引导血液经肺循环与体循环单向流动。" },
  { id: "sensory", nameZh: "感觉器官", nameEn: "Sensory organs", color: "#b0c8ce", description: "视、听、平衡等特殊感觉的结构，感受刺激并与神经系统协同传递信息。" },
  { id: "arterial", nameZh: "动脉", nameEn: "Arteries", color: "#c05245", description: "将血液从心脏输送至全身组织（肺循环中输送至肺）的血管。" },
  { id: "venous", nameZh: "静脉", nameEn: "Veins", color: "#527c9f", description: "将血液回流至心脏的血管网络；肺静脉将含氧血送回心脏。" },
  { id: "nervous", nameZh: "神经系统", nameEn: "Nervous system", color: "#d8b565", description: "脑、脊髓与周围神经承载并处理信号，支持感觉、运动、协调与内脏调节。" },
  { id: "respiratory", nameZh: "呼吸系统", nameEn: "Respiratory", color: "#b98991", description: "气道将空气输送至肺进行氧气与二氧化碳交换，呼吸肌驱动通气。" },
  { id: "digestive", nameZh: "消化系统", nameEn: "Digestive", color: "#b8916b", description: "消化管分解食物、吸收营养与水分；消化腺分泌胆汁与消化酶。" },
  { id: "urinary", nameZh: "泌尿系统", nameEn: "Urinary", color: "#b47961", description: "肾过滤血液、调节水盐与酸碱平衡，尿液经输尿管、膀胱与尿道排出。" },
  { id: "lymphatic", nameZh: "淋巴系统", nameEn: "Lymphatic", color: "#879f7c", description: "淋巴管回收多余组织液；淋巴结等淋巴器官参与免疫监视与应答。" },
  { id: "endocrine", nameZh: "内分泌", nameEn: "Endocrine", color: "#c5a09a", description: "内分泌器官向血液释放激素，协调代谢、生长、应激与生殖。" },
  { id: "reproductive", nameZh: "生殖系统", nameEn: "Reproductive", color: "#bda098", description: "男性生殖结构参与精子的产生、成熟、运输与性激素分泌。" },
  { id: "integumentary", nameZh: "体被系统", nameEn: "Body surface", color: "#ba9b7d", description: "体表构成外部解剖参照与保护屏障，参与感觉与体温调节。" },
  { id: "connective", nameZh: "结缔组织", nameEn: "Connective tissue", color: "#aec3bb", description: "软骨、韧带等结缔组织支持、连接并分隔各结构，稳定关节并分散机械负荷。" },
];

export const SYSTEM_COLOR: Record<string, string> = Object.fromEntries(
  ATLAS_SYSTEMS.map((s) => [s.id, s.color])
);
export const SYSTEM_ZH: Record<string, string> = Object.fromEntries(
  ATLAS_SYSTEMS.map((s) => [s.id, s.nameZh])
);

// ── 数据加载（模块级缓存，切页不重复下载）─────────────────────────

const g = globalThis as unknown as {
  __atlasJson?: Promise<AtlasJson>;
  __atlasChunks?: Map<number, Promise<ArrayBuffer>>;
};

export function loadAtlasJson(): Promise<AtlasJson> {
  if (!g.__atlasJson) {
    g.__atlasJson = fetch("/atlas/atlas.json").then((r) => {
      if (!r.ok) throw new Error(`atlas.json 加载失败 (${r.status})`);
      return r.json() as Promise<AtlasJson>;
    });
  }
  return g.__atlasJson;
}

/** 下载并 gunzip 解压一个 chunk（浏览器 DecompressionStream） */
export function loadChunkBuffer(i: number): Promise<ArrayBuffer> {
  if (!g.__atlasChunks) g.__atlasChunks = new Map();
  const cached = g.__atlasChunks.get(i);
  if (cached) return cached;
  if (typeof DecompressionStream === "undefined") {
    return Promise.reject(new Error("当前浏览器不支持 DecompressionStream，请使用新版 Chrome/Edge/Firefox/Safari"));
  }
  const p = (async () => {
    const res = await fetch(`/atlas/body-${i}.bin.gz`);
    if (!res.ok) throw new Error(`body-${i}.bin.gz 加载失败 (${res.status})`);
    const ds = new DecompressionStream("gzip");
    const stream = (await res.blob()).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer();
  })();
  g.__atlasChunks.set(i, p);
  return p;
}

// ── chunk 几何构建 ────────────────────────────────────────────────

export interface BuiltChunk {
  chunk: number;
  /** 本 chunk 第一个 part 的全局索引（在 json.parts 中的下标） */
  base: number;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** 每顶点的全局 part 索引（拾取用） */
  partIds: Uint16Array;
}

/** 将 chunk 二进制按 atlas.json 偏移解析为合并的顶点/索引/结构编号数组 */
export function buildChunkGeometry(json: AtlasJson, chunkIdx: number, buf: ArrayBuffer): BuiltChunk {
  const parts = json.parts;
  // 找到本 chunk 各 part 的全局索引
  const chunkParts: { p: AtlasPart; gi: number }[] = [];
  let base = -1;
  for (let gi = 0; gi < parts.length; gi++) {
    if (parts[gi].chunk === chunkIdx) {
      if (base === -1) base = gi;
      chunkParts.push({ p: parts[gi], gi });
    }
  }
  if (base === -1) throw new Error(`chunk ${chunkIdx} 中没有 part`);

  let vTotal = 0;
  let iTotal = 0;
  for (const { p } of chunkParts) {
    vTotal += p.vertexCount;
    iTotal += p.indexCount;
  }

  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const indices = new Uint32Array(iTotal);
  const partIds = new Uint16Array(vTotal);

  let vBase = 0;
  let iBase = 0;
  for (const { p, gi } of chunkParts) {
    // positions: f32，零拷贝视图后拷贝
    const posView = new Float32Array(buf, p.positions, p.vertexCount * 3);
    positions.set(posView, vBase * 3);
    // normals: u16 归一化 → f32 [-1,1]
    const norView = new Uint16Array(buf, p.normals, p.vertexCount * 3);
    for (let k = 0; k < p.vertexCount * 3; k++) {
      normals[vBase * 3 + k] = norView[k] / 32767 - 1;
    }
    // indices: u32，叠加顶点基址
    const idxView = new Uint32Array(buf, p.indices, p.indexCount);
    for (let k = 0; k < p.indexCount; k++) {
      indices[iBase + k] = idxView[k] + vBase;
    }
    // partId
    partIds.fill(gi, vBase, vBase + p.vertexCount);
    vBase += p.vertexCount;
    iBase += p.indexCount;
  }

  return { chunk: chunkIdx, base, positions, normals, indices, partIds };
}

/** part 中心点（世界坐标，米） */
export function partCenter(p: AtlasPart): [number, number, number] {
  return [
    (p.bounds[0][0] + p.bounds[1][0]) / 2,
    (p.bounds[0][1] + p.bounds[1][1]) / 2,
    (p.bounds[0][2] + p.bounds[1][2]) / 2,
  ];
}

/** 爆炸视图偏移：从身体中心沿径向推开 */
export function explodeOffset(p: AtlasPart): [number, number, number] {
  const c = partCenter(p);
  const center: [number, number, number] = [0, 0.92, 0.01];
  let dx = c[0] - center[0];
  let dy = c[1] - center[1];
  let dz = c[2] - center[2];
  let len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) {
    dx = (Math.random() - 0.5) * 0.01;
    dy = 0.01;
    dz = (Math.random() - 0.5) * 0.01;
    len = Math.hypot(dx, dy, dz);
  }
  const dist = Math.max(len * 0.62, 0.03);
  return [(dx / len) * dist, (dy / len) * dist, (dz / len) * dist];
}

// 常用中文解剖名词 → 英文检索词别名（BodyParts3D 结构名为英文）
const ZH_ALIASES: [RegExp, string][] = [
  [/肾|肾脏/, "kidney"],
  [/心脏|心肌/, "heart"],
  [/肝/, "liver"],
  [/肺/, "lung"],
  [/脑|大脑|小脑/, "brain"],
  [/骨|脊柱|椎|肋/, "bone"],
  [/动脉/, "artery"],
  [/静脉/, "vein"],
  [/神经/, "nerve"],
  [/肌肉|肌/, "muscle"],
  [/子宫|卵巢|输卵管/, "uterus"],
  [/前列腺|睾丸|输精管/, "prostate"],
  [/胃/, "stomach"],
  [/胰/, "pancreas"],
  [/肠|结肠|直肠|阑尾/, "intestine"],
  [/眼|眼球/, "eye"],
  [/皮肤/, "skin"],
  [/淋巴/, "lymph"],
  [/气管|支气管/, "trachea"],
  [/甲状腺/, "thyroid"],
  [/膀胱/, "bladder"],
  [/食管/, "esophagus"],
  [/腺/, "gland"],
  [/关节|韧带/, "ligament"],
  [/软骨/, "cartilage"],
  [/头|颅/, "head"],
  [/手|指/, "hand"],
  [/足|脚|趾/, "foot"],
];

// 女性模式下需隐藏的男性生殖相关结构（含其动静脉与尿道）：
// 阴茎背动/静脉、睾丸动/静脉、阴部内静脉、阴茎海绵体/龟头、附睾、精囊、
// 前列腺、尿道（BodyParts3D 为男性尿道）等
export const FEMALE_HIDDEN_RE =
  /penis|penile|testicul|scrot|pudendal|cremaster|prostat|epididym|deferens|spermatic|cavernos|glans|urethra|urethral|seminal|bulb/i;

/** 按名称/概念名/系统名搜索 part，返回全局索引数组 */
export function searchParts(json: AtlasJson, q: string, limit = 60): number[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  // 1) 系统（中文名/英文名/系统 id）直接匹配 → 返回该系统全部结构
  const sys = ATLAS_SYSTEMS.find(
    (s) =>
      s.nameZh.includes(q.trim()) ||
      s.nameEn.toLowerCase().includes(needle) ||
      s.id === needle
  );
  if (sys) {
    const out: number[] = [];
    for (let gi = 0; gi < json.parts.length; gi++) {
      if (json.parts[gi].system === sys.id) {
        out.push(gi);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // 2) 中文别名扩展（如「肾」→ kidney）后做包含匹配
  const terms = new Set<string>([needle]);
  for (const [re, en] of ZH_ALIASES) {
    if (re.test(q)) terms.add(en);
  }

  const conceptName = new Map(json.concepts.map((c) => [c.id, c.name.toLowerCase()]));
  const hits: number[] = [];
  for (let gi = 0; gi < json.parts.length; gi++) {
    const p = json.parts[gi];
    const pname = p.name.toLowerCase();
    const cname = conceptName.get(p.conceptId) ?? "";
    let ok = false;
    for (const t of terms) {
      if (pname.includes(t) || cname.includes(t) || p.id.toLowerCase().includes(t)) {
        ok = true;
        break;
      }
    }
    if (ok) {
      hits.push(gi);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
