"use client";

// 精细人体图谱查看器：2,234 个可选择解剖结构（BodyParts3D 4.0）。
// 渲染方案（沿用 human-atlas 的思路）：每个 chunk 合并为一个 Mesh（共 15 个 draw call），
// 顶点携带全局 partId；GPU DataTexture（256×16 RGBA float）控制每个结构的
// 可见性 / 高亮 / 调暗与爆炸位移，点击拾取通过 face 顶点反查 partId。
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { FemaleReproductive } from "@/components/sim/FemaleReproductive";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import {
  ATLAS_SYSTEMS,
  FEMALE_HIDDEN_RE,
  SYSTEM_COLOR,
  AtlasJson,
  BuiltChunk,
  buildChunkGeometry,
  createAtlasRaycast,
  explodeOffset,
  loadAtlasJson,
  loadChunkBuffer,
  partCenter,
  searchParts,
} from "./atlasData";

const TEX_W = 256;
const TEX_H = 16; // 256×16 = 4096 ≥ 2234 parts
const MAX_PARTS = TEX_W * TEX_H;

export interface StructureInfo {
  name: string;
  systemId: string;
  systemZh: string;
  systemDesc: string;
  conceptId: string;
  sizeMm: [number, number, number];
}

function writeOffsets(data: Float32Array, texture: THREE.DataTexture, json: AtlasJson) {
  json.parts.forEach((part, gi) => {
    const off = explodeOffset(part);
    data.set([...off, Math.max(0, ATLAS_SYSTEMS.findIndex((s) => s.id === part.system)) / 14], gi * 4);
  });
  texture.needsUpdate = true;
}

function writeStates(
  data: Float32Array, texture: THREE.DataTexture, json: AtlasJson,
  systems: Set<string>, sex: "male" | "female", selected: number | null, hits: number[] | null
) {
  const hitSet = hits ? new Set(hits) : null;
  json.parts.forEach((part, gi) => {
    const hidden = sex === "female" && (part.system === "reproductive" || FEMALE_HIDDEN_RE.test(part.name));
    data.set([
      systems.has(part.system) && !hidden ? 1 : 0,
      selected === gi ? 1 : hitSet?.has(gi) ? 0.62 : 0,
      hitSet && !hitSet.has(gi) && selected !== gi ? 0.82 : 0,
      part.system === "integumentary" ? 0.14 : 1,
    ], gi * 4);
  });
  texture.needsUpdate = true;
}

function setExplodeAmount(material: THREE.ShaderMaterial, value: number) {
  material.uniforms.uExplode.value = value;
}

interface Props {
  onSelectStructure?: (info: StructureInfo) => void;
  /** 模型性别：女性模式下隐藏男性生殖结构（BodyParts3D 数据为男性） */
  sex?: "male" | "female";
}

function useAtlasMaterial() {
  return useMemo(() => {
    const stateData = new Float32Array(MAX_PARTS * 4); // r=可见 g=高亮 b=调暗
    const offsetData = new Float32Array(MAX_PARTS * 4); // rgb=爆炸位移 a=系统索引/14
    const stateTex = new THREE.DataTexture(stateData, TEX_W, TEX_H, THREE.RGBAFormat, THREE.FloatType);
    const offsetTex = new THREE.DataTexture(offsetData, TEX_W, TEX_H, THREE.RGBAFormat, THREE.FloatType);
    for (const t of [stateTex, offsetTex]) {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.needsUpdate = true;
    }
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uState: { value: stateTex },
        uOffset: { value: offsetTex },
        uExplode: { value: 0 },
        uHighlightColor: { value: new THREE.Color("#39e6d0") },
        uPalette: {
          value: ATLAS_SYSTEMS.map((s) => new THREE.Color(s.color)),
        },
      },
      vertexShader: /* glsl */ `
        uniform sampler2D uState;
        uniform sampler2D uOffset;
        uniform float uExplode;
        uniform vec3 uPalette[15];
        attribute float partId;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying float vHi;
        varying float vDim;
        varying float vAlpha;
        void main() {
          vec2 suv = (vec2(mod(partId, ${TEX_W}.0), floor(partId / ${TEX_W}.0)) + 0.5) / vec2(${TEX_W}.0, ${TEX_H}.0);
          vec4 st = texture2D(uState, suv);
          vec4 off = texture2D(uOffset, suv);
          int sysId = int(off.a * 14.0 + 0.5);
          vec3 p = position + off.rgb * uExplode;
          vNormal = normalMatrix * normal;
          vColor = uPalette[sysId];
          vHi = st.g;
          vDim = st.b;
          vAlpha = st.a;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          if (st.r < 0.5) gl_Position = vec4(0.0, 0.0, 3.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHighlightColor;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying float vHi;
        varying float vDim;
        varying float vAlpha;
        // 4×4 Bayer 抖动：半透明结构（体表）以点阵形式透出内部结构，
        // 同时保留深度写入，避免透明排序伪影
        float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          if (vAlpha < 0.999 && bayer4(gl_FragCoord.xy) > vAlpha) discard;
          vec3 n = normalize(vNormal);
          if (!gl_FrontFacing) n = -n;
          float diff = max(dot(n, normalize(vec3(0.5, 0.85, 0.55))), 0.0);
          float back = max(dot(n, normalize(vec3(-0.4, -0.15, -0.6))), 0.0);
          vec3 col = vColor * (0.52 + 0.58 * diff) + vColor * 0.16 * back;
          col = mix(col, uHighlightColor, clamp(vHi, 0.0, 1.0) * 0.85);
          col *= mix(1.0, 0.30, clamp(vDim, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
    return { material, stateData, offsetData, stateTex, offsetTex };
  }, []);
}

interface FocusGoal {
  target: THREE.Vector3;
  pos: THREE.Vector3;
  key: number;
}

function FocusRig({ goal, resetKey }: { goal: FocusGoal | null; resetKey: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const animRef = useRef(false);
  const goalRef = useRef<FocusGoal | null>(goal);
  useEffect(() => {
    goalRef.current = goal;
    animRef.current = true;
  }, [goal, resetKey]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (animRef.current = false);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goalRef.current;
    if (!animRef.current || !controls || !g) return;
    const k = 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.01 && controls.target.distanceTo(g.target) < 0.01) {
      animRef.current = false;
    }
  });
  return null;
}

export default function AtlasViewer({ onSelectStructure, sex = "male" }: Props) {
  const [chunks, setChunks] = useState<(BuiltChunk & { geo: THREE.BufferGeometry; raycast: THREE.Mesh["raycast"] })[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [visibleSystems, setVisibleSystems] = useState<Set<string>>(
    () => new Set(ATLAS_SYSTEMS.map((s) => s.id))
  );
  const [explode, setExplode] = useState(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<number[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [focusGoal, setFocusGoal] = useState<FocusGoal | null>(null);
  const [femaleSel, setFemaleSel] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);

  const [json, setJson] = useState<AtlasJson | null>(null);
  const { material, stateData, offsetData, stateTex, offsetTex } = useAtlasMaterial();

  // 加载 atlas.json + 15 个 chunk（并行，逐个就绪）
  useEffect(() => {
    let alive = true;
    const geometries: THREE.BufferGeometry[] = [];
    (async () => {
      try {
        const json = await loadAtlasJson();
        if (!alive) return;
        setJson(json);
        writeOffsets(offsetData, offsetTex, json);

        const total = json.chunks.length;
        let done = 0;
        await Promise.all(
          json.chunks.map(async (_, i) => {
            try {
              const buf = await loadChunkBuffer(i);
              const built = buildChunkGeometry(json, i, buf);
              const geo = new THREE.BufferGeometry();
              geometries.push(geo);
              geo.setAttribute("position", new THREE.BufferAttribute(built.positions, 3));
              geo.setAttribute("normal", new THREE.BufferAttribute(built.normals, 3));
              geo.setAttribute("partId", new THREE.BufferAttribute(built.partIds, 1));
              geo.setIndex(new THREE.BufferAttribute(built.indices, 1));
              geo.computeBoundingSphere();
              if (!alive) {
                geo.dispose();
                return;
              }
              const raycast = createAtlasRaycast(json.parts, i, stateData, offsetData, () => material.uniforms.uExplode.value);
              setChunks((prev) => [...prev, { ...built, geo, raycast }]);
            } finally {
              done += 1;
              if (alive) setProgress(done / total);
            }
          })
        );
        if (alive) setLoaded(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
      geometries.forEach((geo) => geo.dispose());
    };
  }, [offsetData, offsetTex, stateData, material, retryKey]);

  // 可见性 / 高亮 / 调暗 / 透明度写入 GPU 纹理
  useEffect(() => {
    if (!json) return;
    writeStates(stateData, stateTex, json, visibleSystems, sex, selected, hits);
  }, [visibleSystems, selected, hits, json, sex, stateData, stateTex]);

  // 搜索（防抖）
  useEffect(() => {
    const t = setTimeout(() => {
      if (!json) return;
      setHits(query.trim() ? searchParts(json, query) : null);
    }, 250);
    return () => clearTimeout(t);
  }, [query, json]);

  // 爆炸系数
  useEffect(() => {
    setExplodeAmount(material, explode);
  }, [explode, material]);

  useEffect(() => () => {
    material.dispose();
    stateTex.dispose();
    offsetTex.dispose();
  }, [material, stateTex, offsetTex]);

  const pickPart = (vertexIndex: number, geometry: THREE.BufferGeometry): number | null => {
    const attr = geometry.getAttribute("partId");
    if (!attr) return null;
    return attr.getX(vertexIndex);
  };

  const focusPart = (gi: number) => {
    if (!json) return;
    const p = json.parts[gi];
    const c = partCenter(p);
    const dx = p.bounds[1][0] - p.bounds[0][0];
    const dy = p.bounds[1][1] - p.bounds[0][1];
    const dz = p.bounds[1][2] - p.bounds[0][2];
    const dist = Math.max(Math.hypot(dx, dy, dz) * 2.4, 0.22);
    const o = gi * 4;
    const target = new THREE.Vector3(c[0], c[1], c[2]).add(
      new THREE.Vector3(offsetData[o], offsetData[o + 1], offsetData[o + 2]).multiplyScalar(explode)
    );
    // 保持当前观察方向，仅改变距离
    setFocusGoal((prev) => {
      const dir = prev
        ? prev.pos.clone().sub(prev.target).normalize()
        : new THREE.Vector3(0.18, 0.3, 1).normalize();
      return { target, pos: target.clone().add(dir.multiplyScalar(dist)), key: Date.now() };
    });
  };

  const resetView = () => {
    setSelected(null);
    setFemaleSel(false);
    setFocusGoal({
      target: new THREE.Vector3(0, 0.98, 0),
      pos: new THREE.Vector3(0.32, 1.4, 2.15),
      key: Date.now(),
    });
    setResetKey((k) => k + 1);
  };

  const femaleInfo: StructureInfo | null = useMemo(() => {
    if (!femaleSel || sex !== "female") return null;
    const sys = ATLAS_SYSTEMS.find((s) => s.id === "reproductive");
    return {
      name: sex === "female" ? "子宫与附件（女性）" : "子宫与附件",
      systemId: "reproductive",
      systemZh: sys?.nameZh ?? "生殖系统",
      systemDesc:
        "女性内生殖器官（程序化建模）：梨形肌性子宫，双侧输卵管连接卵巢。受激素调控产生月经并孕育胎儿。",
      conceptId: "Female-Internal",
      sizeMm: [75, 50, 40],
    };
  }, [femaleSel, sex]);

  const selectedInfo: StructureInfo | null = useMemo(() => {
    if (!json || selected === null) return null;
    const p = json.parts[selected];
    const sys = ATLAS_SYSTEMS.find((s) => s.id === p.system);
    return {
      name: p.name,
      systemId: p.system,
      systemZh: sys?.nameZh ?? p.system,
      systemDesc: sys?.description ?? "",
      conceptId: p.conceptId,
      sizeMm: [
        Math.round((p.bounds[1][0] - p.bounds[0][0]) * 1000),
        Math.round((p.bounds[1][1] - p.bounds[0][1]) * 1000),
        Math.round((p.bounds[1][2] - p.bounds[0][2]) * 1000),
      ],
    };
  }, [selected, json]);
  const shownInfo = femaleInfo ?? selectedInfo;

  return (
    <div className="fl relative flex h-full min-h-[560px] gap-3">
      <button className="btn absolute left-3 top-3 z-20 lg:hidden" onClick={() => setControlsOpen(true)}>
        搜索与系统控制
      </button>
      {/* 左侧控制面板 */}
      <div className={`panel absolute inset-y-0 left-0 z-30 w-64 max-w-full shrink-0 flex-col overflow-y-auto p-3 lg:relative lg:inset-auto lg:z-auto lg:flex lg:w-56 ${controlsOpen ? "flex" : "hidden"}`}>
        <button className="btn mb-3 lg:hidden" onClick={() => setControlsOpen(false)}>关闭控制面板</button>
        <div className="label !mt-0">结构搜索</div>
        <input
          className="input"
          placeholder="如：heart / 动脉 / FMA…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {hits && (
          <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--line)]">
            <div className="border-b border-[var(--line)] bg-[var(--btn-bg-hover)] px-2.5 py-1 text-[11px] text-[var(--muted)]">
              {hits.length} 个匹配结构
            </div>
            {hits.length === 0 && (
              <div className="px-2.5 py-2 text-[12px] text-[var(--muted)]">无匹配</div>
            )}
            {hits.map((gi) => (
              <button
                key={gi}
                className="block w-full px-2.5 py-1.5 text-left text-[12px] text-[var(--text)] hover:bg-[var(--btn-bg-hover)] hover:text-[var(--heading)]"
                onClick={() => {
                  setSelected(gi);
                  focusPart(gi);
                }}
              >
                {json?.parts[gi]?.name}
              </button>
            ))}
          </div>
        )}

        <div className="label mt-4">爆炸视图</div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={explode}
          onChange={(e) => setExplode(Number(e.target.value))}
          className="w-full accent-teal-400"
        />

        <div className="label mt-4">解剖系统（{visibleSystems.size}/{ATLAS_SYSTEMS.length}）</div>
        <div className="space-y-1.5">
          {ATLAS_SYSTEMS.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                className="accent-teal-400"
                checked={visibleSystems.has(s.id)}
                onChange={() =>
                  setVisibleSystems((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: SYSTEM_COLOR[s.id] }}
              />
              <span className="text-[var(--text)]">
                {s.nameZh}
                <span className="ml-1 text-[10.5px] text-[var(--muted)]">{s.nameEn}</span>
              </span>
            </label>
          ))}
        </div>

        <button className="btn mt-4" onClick={resetView}>
          重置视角与选择
        </button>
      </div>

      {/* 3D 视图 */}
      <div className="panel relative min-w-0 flex-1 overflow-hidden bg-[var(--panel-2)]">
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0.32, 1.4, 2.15], fov: 40, near: 0.01, far: 40 }}
          gl={{ antialias: true, alpha: true }}
          onPointerMissed={() => { setSelected(null); setFemaleSel(false); }}
        >
          <FocusRig goal={focusGoal} resetKey={resetKey} />
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={0.08}
            maxDistance={5}
            target={[0, 0.98, 0]}
          />
          {/* 女性模式：乳房轮廓（随体被系统显隐，颜色与体表一致） */}
          {sex === "female" && visibleSystems.has("integumentary") && (
            <>
              <mesh position={[-0.077, 1.305, 0.105]} scale={[1, 0.95, 0.62]}>
                <sphereGeometry args={[0.062, 20, 14]} />
                <meshStandardMaterial color="#ba9b7d" roughness={0.75} />
              </mesh>
              <mesh position={[0.077, 1.305, 0.105]} scale={[1, 0.95, 0.62]}>
                <sphereGeometry args={[0.062, 20, 14]} />
                <meshStandardMaterial color="#ba9b7d" roughness={0.75} />
              </mesh>
            </>
          )}
          {sex === "female" && visibleSystems.has("reproductive") && (
            <Suspense fallback={null}>
              <FemaleReproductive
                position={[0, 0.955, -0.01]}
                targetSize={0.13}
                highlight={femaleSel}
                xray
                onClick={(e) => {
                  e.stopPropagation();
                  setFemaleSel(true);
                  setSelected(null);
                  const t = new THREE.Vector3(0, 0.955, -0.01);
                  setFocusGoal((prev) => {
                    const dir = prev
                      ? prev.pos.clone().sub(prev.target).normalize()
                      : new THREE.Vector3(0.18, 0.3, 1).normalize();
                    return { target: t, pos: t.clone().add(dir.multiplyScalar(0.42)), key: Date.now() };
                  });
                }}
              />
            </Suspense>
          )}
          {/* 标准材质网格（乳房/子宫附件）所需灯光；chunk shader 自带光照不受影响 */}
          <ambientLight intensity={0.85} />
          <hemisphereLight args={["#e8eef6", "#8a7a68", 0.6]} />
          <directionalLight position={[2.5, 4, 3]} intensity={1.1} />

          <Suspense fallback={null}>
            {chunks.map((c) => (
              <mesh
                key={c.chunk}
                geometry={c.geo}
                material={material}
                raycast={c.raycast}
                frustumCulled={false}
                onClick={(e) => {
                  e.stopPropagation();
                  const gi = pickPart(e.face?.a ?? 0, c.geo);
                  if (gi !== null) {
                    setFemaleSel(false);
                    setSelected(gi);
                    focusPart(gi);
                  }
                }}
              />
            ))}
          </Suspense>
        </Canvas>

        {/* 加载进度 */}
        {!loaded && !error && (
          <div className="absolute inset-0 grid place-items-center bg-[rgba(244,247,251,0.75)]">
            <div className="w-64 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#22406b] border-t-[var(--accent)]" />
              <div className="mb-2 text-[13px] text-[var(--muted)]">
                正在加载人体图谱（2,234 个结构 · 15 批次网格）…
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#12203a]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-400 to-blue-500 transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-[rgba(7,13,24,0.8)] p-6 text-center text-[13px] text-red-300">
            <div>
              <p>{error}</p>
              <button className="btn mt-3" onClick={() => {
                setChunks([]);
                setError(null);
                setProgress(0);
                setLoaded(false);
                setRetryKey((key) => key + 1);
              }}>重新加载图谱</button>
            </div>
          </div>
        )}

        {/* 结构详情卡 */}
        {shownInfo && (
          <div className="panel-2 absolute bottom-3 left-3 w-64 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[14px] font-bold leading-snug text-[var(--heading)]">
                  {shownInfo.name}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11.5px]">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: SYSTEM_COLOR[shownInfo.systemId] }}
                  />
                  <span className="text-[var(--muted)]">
                    {shownInfo.systemZh} · {shownInfo.conceptId}
                  </span>
                </div>
              </div>
              <button
                className="text-[var(--muted)] hover:text-[var(--heading)]"
                onClick={() => { setSelected(null); setFemaleSel(false); }}
              >
                ✕
              </button>
            </div>
            <div className="mt-2 text-[11.5px] text-[var(--muted)]">
              包围盒 {shownInfo.sizeMm.join(" × ")} mm
            </div>
            <div className="mt-1.5 line-clamp-3 text-[12px] leading-5 text-[var(--muted)]">
              {shownInfo.systemDesc}
            </div>
            {onSelectStructure && (
              <button
                className="btn btn-primary mt-2.5 w-full !py-1.5 !text-[12px]"
                onClick={() => onSelectStructure(shownInfo)}
              >
                询问 AI 导师这个结构
              </button>
            )}
          </div>
        )}

        {/* 顶部提示 */}
        <div className="pointer-events-none absolute right-3 top-3 text-right text-[11px] text-[var(--muted)]">
          点击结构查看详情 · 拖拽旋转 · 滚轮缩放
          <br />
          BodyParts3D 4.0 · CC BY 4.0{sex === "female" && (
          <br />
        )}{sex === "female" && "女性模式：以男性参考数据为基础，已隐藏男性生殖结构"}
        </div>
      </div>
    </div>
  );
}
