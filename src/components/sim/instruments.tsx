"use client";

// 程序化手术器械库与操作动画。
// 每件器械为低多边形风格化模型（长度 1，握持端在原点、尖端朝 -Y），
// InstrumentRig 依据动作类型与步骤进度驱动「进入 → 操作 → 退出」三段动画。
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

// ── 共享材质 ──────────────────────────────────────────────
const METAL = new THREE.MeshStandardMaterial({ color: "#cdd6e0", metalness: 0.85, roughness: 0.28 });
const STEEL = new THREE.MeshStandardMaterial({ color: "#9aa7b5", metalness: 0.9, roughness: 0.22 });
const DARKMAT = new THREE.MeshStandardMaterial({ color: "#232c39", metalness: 0.35, roughness: 0.55 });
const TEALMAT = new THREE.MeshStandardMaterial({ color: "#2dd4bf", emissive: "#2dd4bf", emissiveIntensity: 0.75, metalness: 0.2, roughness: 0.4 });
const EMBER = new THREE.MeshStandardMaterial({ color: "#ff8c42", emissive: "#ff6a1a", emissiveIntensity: 1.1 });

type Builder = () => THREE.Group;

function box(w: number, h: number, d: number, mat: THREE.Material, y = 0, x = 0, z = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.z = rz;
  return m;
}
function cyl(rt: number, rb: number, h: number, mat: THREE.Material, y = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), mat);
  m.position.y = y;
  return m;
}
function ring(r: number, mat: THREE.Material, y: number) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 10, 24), mat);
  m.position.y = y;
  m.rotation.x = Math.PI / 2;
  return m;
}

// 剪式双臂（手术剪 / 止血钳 / 持针器共用）
function scissorArms({ jaw = 0.1, cross = 0.012 }: { jaw?: number; cross?: number }) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const arm = box(0.022, 0.62, cross, METAL, -0.31, side * cross * 0.5, 0, side * 0.06);
    g.add(arm);
    const jawM = box(0.018, jaw, cross * 0.8, STEEL, -0.66 - jaw / 2 + 0.03, side * (cross * 0.5 + jaw * 0.12), 0, side * 0.16);
    g.add(jawM);
    const handle = ring(0.05, METAL, 0.06 + side * 0);
    handle.position.x = side * 0.05;
    g.add(handle);
  }
  return g;
}

const BUILDERS: Record<string, Builder> = {
  scalpel() {
    const g = new THREE.Group();
    g.add(box(0.05, 0.5, 0.026, DARKMAT, -0.25)); // 刀柄
    g.add(cyl(0.026, 0.026, 0.05, DARKMAT, 0.02));
    g.add(box(0.03, 0.4, 0.011, STEEL, -0.68)); // 刀身
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.14, 4), STEEL);
    tip.scale.set(0.55, 1, 1);
    tip.position.y = -0.94;
    tip.rotation.y = Math.PI / 4;
    g.add(tip);
    return g;
  },
  electro() {
    const g = new THREE.Group();
    g.add(cyl(0.028, 0.032, 0.6, DARKMAT, -0.3));
    g.add(box(0.07, 0.14, 0.05, DARKMAT, -0.05));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.22, 8), EMBER);
    tip.position.y = -0.7;
    g.add(tip);
    return g;
  },
  hemostat() {
    const g = new THREE.Group();
    g.add(scissorArms({ jaw: 0.14, cross: 0.014 }));
    return g;
  },
  scissors() {
    const g = new THREE.Group();
    g.add(scissorArms({ jaw: 0.18, cross: 0.014 }));
    return g;
  },
  needle() {
    const g = new THREE.Group();
    g.add(scissorArms({ jaw: 0.08, cross: 0.016 }));
    // 弯针
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.007, 8, 20, Math.PI * 0.9), STEEL);
    arc.position.set(0, -0.76, 0);
    arc.rotation.x = Math.PI / 2;
    arc.rotation.z = Math.PI * 0.15;
    g.add(arc);
    return g;
  },
  trocar() {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 16), STEEL);
    cone.position.y = -0.93;
    cone.rotation.x = Math.PI;
    g.add(cone);
    g.add(cyl(0.048, 0.048, 0.62, METAL, -0.56));
    g.add(cyl(0.075, 0.075, 0.1, TEALMAT, -0.2)); // 顶盘阀门
    g.add(cyl(0.03, 0.03, 0.16, DARKMAT, -0.08));
    return g;
  },
  scope() {
    const g = new THREE.Group();
    g.add(cyl(0.018, 0.018, 0.9, METAL, -0.45));
    const lens = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 12), TEALMAT);
    lens.position.y = -0.93;
    lens.rotation.x = Math.PI;
    g.add(lens);
    g.add(box(0.06, 0.12, 0.045, DARKMAT, -0.06));
    g.add(cyl(0.024, 0.024, 0.22, DARKMAT, 0.12)); // 光缆
    return g;
  },
  irrigator() {
    const g = new THREE.Group();
    g.add(cyl(0.02, 0.02, 0.72, METAL, -0.36));
    g.add(box(0.055, 0.2, 0.04, DARKMAT, -0.02));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.1, 10), STEEL);
    tip.position.y = -0.77;
    tip.rotation.x = Math.PI;
    g.add(tip);
    return g;
  },
  bag() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: "#7fd8ff", transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.1), mat);
    b.position.y = -0.55;
    g.add(b);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.26, 0.3, 0.1)), new THREE.LineBasicMaterial({ color: "#2dd4bf" }));
    edges.position.y = -0.55;
    g.add(edges);
    g.add(box(0.2, 0.03, 0.02, METAL, -0.38));
    return g;
  },
  gauze() {
    const g = new THREE.Group();
    g.add(box(0.24, 0.012, 0.18, new THREE.MeshStandardMaterial({ color: "#e8ecf2", roughness: 0.9 }), -0.95));
    return g;
  },
};

// 器械名称 → 模型 id
export const INSTRUMENT_MAP: [RegExp, string][] = [
  [/手术刀|刀片/, "scalpel"],
  [/电刀|电凝/, "electro"],
  [/止血钳|钳/, "hemostat"],
  [/剪刀|剪/, "scissors"],
  [/持针|缝/, "needle"],
  [/穿刺|trocar|套管/i, "trocar"],
  [/腹腔镜|镜头|镜/i, "scope"],
  [/冲洗|吸引/, "irrigator"],
  [/标本袋|标本/, "bag"],
  [/纱布/, "gauze"],
];

export function instrumentIds(names: string[]): string[] {
  const ids: string[] = [];
  for (const n of names) {
    for (const [re, id] of INSTRUMENT_MAP) {
      if (re.test(n) && !ids.includes(id)) { ids.push(id); break; }
    }
  }
  return ids.slice(0, 3);
}

// 各动作的工作偏移（相对术区焦点）
function workOffset(action: string, i: number): [number, number, number] {
  const spread = (i - 1) * 0.16;
  switch (action) {
    case "trocar": return [[-0.28, 0, 0.14][i % 3] ?? 0, 0.02, [0.1, -0.1, -0.12][i % 3] ?? 0];
    case "cut": return [spread * 0.6 - 0.06, 0.03, 0.02];
    case "coagulate": return [0.1 + spread * 0.4, 0.02, 0];
    case "suture": return [-0.12 + spread * 0.4, 0.03, 0.04];
    case "extract": return [0.05, 0.06, 0.1];
    case "irrigate": return [0, 0.04, 0.06];
    default: return [spread * 0.5, 0.04, 0.05 + spread * 0.2];
  }
}

interface RigProps {
  ids: string[];
  action: string;
  /** 术区焦点（世界坐标） */
  focus: [number, number, number];
  /** 器械缩放：概览 ~0.16 / 器官特写 ~0.55 */
  scale: number;
  /** 步骤内进度 0-1（由父级 useFrame 维护的 ref） */
  progressRef: React.MutableRefObject<number>;
  seed: string;
}

export function InstrumentRig({ ids, action, focus, scale, progressRef, seed }: RigProps) {
  const groups = useRef<THREE.Group[]>([]);
  const built = useMemo(
    () => ids.map((id) => (BUILDERS[id]?.() ?? new THREE.Group())),
    [ids.join("|"), seed]
  );

  useFrame((state) => {
    const p = progressRef.current;
    const t = state.clock.elapsedTime;
    built.forEach((g, i) => {
      const root = groups.current[i];
      if (!root) return;
      if (!g || p <= 0 || p >= 1 || action === "position" || action === "none") {
        root.visible = false;
        return;
      }
      root.visible = true;
      const stagger = Math.min(0.3, i * 0.1);
      const pi = THREE.MathUtils.clamp((p - stagger) / (1 - stagger), 0, 1);

      const wo = workOffset(action, i);
      const F = new THREE.Vector3(focus[0] + wo[0], focus[1] + wo[1], focus[2] + wo[2]);
      const start = new THREE.Vector3(F.x + 0.25 + i * 0.08, F.y + 0.55, F.z + 0.3);
      let pos: THREE.Vector3;
      let tilt = 0;

      if (pi < 0.18) {
        // 进入：从上方落下
        const k = pi / 0.18;
        pos = start.clone().lerp(F, THREE.MathUtils.smoothstep(k, 0, 1));
      } else if (pi < 0.82) {
        // 操作阶段
        const p2 = (pi - 0.18) / 0.64;
        pos = F.clone();
        switch (action) {
          case "cut":
            pos.x += (p2 - 0.5) * 0.34;
            pos.y += Math.sin(p2 * Math.PI * 8) * 0.006;
            tilt = 0.3;
            break;
          case "coagulate":
            pos.y += Math.abs(Math.sin(p2 * Math.PI * 7)) * 0.03;
            pos.x += Math.sin(p2 * Math.PI * 3) * 0.05;
            break;
          case "trocar":
            pos.y += (1 - p2) * 0.12;
            tilt = Math.sin(t * 9) * 0.05;
            break;
          case "suture": {
            const a = p2 * Math.PI * 2;
            pos.x += Math.cos(a) * 0.1;
            pos.z += Math.sin(a) * 0.08;
            pos.y += 0.03 + Math.abs(Math.sin(a)) * 0.02;
            tilt = 0.5;
            break;
          }
          case "resect":
            pos.x += Math.sin(p2 * Math.PI * 4) * 0.07;
            pos.y += Math.abs(Math.sin(p2 * Math.PI * 4)) * 0.015;
            tilt = Math.sin(p2 * Math.PI * 12) * 0.12; // 开合
            break;
          case "explore":
          case "dissect": {
            const a = p2 * Math.PI * 2;
            pos.x += Math.cos(a) * 0.14;
            pos.z += Math.sin(a) * 0.1;
            pos.y += 0.03;
            break;
          }
          case "irrigate":
            pos.y += 0.02 + Math.sin(p2 * Math.PI * 6) * 0.012;
            pos.x += Math.sin(p2 * Math.PI * 2) * 0.06;
            break;
          case "clamp":
            pos.y += Math.sin(t * 2.4) * 0.004; // 微颤
            break;
          case "extract":
            pos.y += p2 * 0.3;
            break;
          default:
            pos.y += 0.04;
        }
      } else {
        // 退出：升起收回
        const k = (pi - 0.82) / 0.18;
        pos = F.clone().lerp(start, THREE.MathUtils.smoothstep(k, 0, 1));
        pos.y += k * 0.15;
      }

      root.position.copy(pos);
      // 尖端指向焦点：整体绕 X 前倾，Z 微旋
      root.rotation.set(-0.35 + tilt * 0.3, Math.sin(i * 2.1 + t * 0.2) * 0.08, tilt);
      const exitK = pi >= 0.82 ? 1 - (pi - 0.82) / 0.18 : 1;
      const s = scale * (0.85 + 0.15 * exitK);
      root.scale.setScalar(s);
    });
  });

  return (
    <group>
      {built.map((g, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) groups.current[i] = el;
          }}
        >
          <primitive object={g} />
        </group>
      ))}
    </group>
  );
}

/** 术区标记：脉动的切口定位环 */
export function RegionMarker({
  position,
  scale = 1,
  progressRef,
}: {
  position: [number, number, number];
  scale?: number;
  progressRef: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 3.2) * 0.12;
    g.scale.setScalar(scale * pulse);
    g.rotation.z = t * 0.5;
    g.visible = progressRef.current > 0.02 && progressRef.current < 0.98;
  });
  return (
    <group ref={ref} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.085, 0.006, 10, 40]} />
        <meshStandardMaterial color="#2dd4bf" emissive="#2dd4bf" emissiveIntensity={1.3} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.115, 0.003, 8, 40]} />
        <meshStandardMaterial color="#2dd4bf" emissive="#2dd4bf" emissiveIntensity={0.7} transparent opacity={0.55} />
      </mesh>
      {/* 切口线 */}
      <mesh position={[0, 0.002, 0]}>
        <boxGeometry args={[0.17, 0.004, 0.012]} />
        <meshStandardMaterial color="#7fe9dc" emissive="#2dd4bf" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}
