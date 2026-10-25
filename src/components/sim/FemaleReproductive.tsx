"use client";

// 程序化女性内生殖器官：子宫（梨形肌性器官）+ 双侧输卵管 + 卵巢 + 宫颈阴道。
// BodyParts3D 数据为男性参考体、无女性生殖网格，故按解剖比例程序化建模（单位：米）。
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

function build(): THREE.Group {
  const g = new THREE.Group();

  const uterineMat = new THREE.MeshStandardMaterial({ color: "#c96a72", roughness: 0.5, metalness: 0 });
  const tubeMat = new THREE.MeshStandardMaterial({ color: "#dd8f93", roughness: 0.5, metalness: 0 });
  const ovaryMat = new THREE.MeshStandardMaterial({ color: "#ecc4bb", roughness: 0.55, metalness: 0 });

  // 子宫体：梨形（上宽下窄）
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), uterineMat);
  body.scale.set(0.031, 0.041, 0.022);
  body.position.y = 0.052;
  g.add(body);
  // 宫底圆顶
  const fundus = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), uterineMat);
  fundus.scale.set(1, 0.6, 0.75);
  fundus.position.y = 0.075;
  g.add(fundus);
  // 宫颈
  const cervix = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.03, 16), uterineMat);
  cervix.position.y = 0.012;
  g.add(cervix);
  // 阴道（上段，含蓄表现）
  const vagina = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.02, 0.045, 16), new THREE.MeshStandardMaterial({ color: "#d8a49e", roughness: 0.6 }));
  vagina.position.y = -0.02;
  g.add(vagina);

  // 双侧输卵管：自宫底两侧弧形外展至卵巢
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.014, 0.062, 0),
      new THREE.Vector3(side * 0.038, 0.068, 0.004),
      new THREE.Vector3(side * 0.056, 0.05, 0.006),
      new THREE.Vector3(side * 0.062, 0.03, 0.004),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.005, 10), tubeMat);
    // 伞端（喇叭口）
    const fimbria = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.014, 12), tubeMat);
    fimbria.position.set(side * 0.062, 0.026, 0.004);
    fimbria.rotation.z = side * -0.9;
    g.add(tube, fimbria);
    // 卵巢
    const ovary = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), ovaryMat);
    ovary.scale.set(0.013, 0.009, 0.008);
    ovary.position.set(side * 0.066, 0.014, -0.002);
    g.add(ovary);
  }

  return g;
}

export interface FemaleReproductiveProps {
  /** 目标最大尺寸（米）。概览 0.16、图谱 ~0.13、特写 1.6 */
  targetSize?: number;
  position?: [number, number, number];
  highlight?: boolean;
  autoRotate?: boolean;
  /** X 光透视：关闭深度测试，被骨骼/肌肉遮挡时仍可见（图谱用） */
  xray?: boolean;
  onClick?: (e: { stopPropagation: () => void }) => void;
}

export function FemaleReproductive({
  targetSize = 0.16,
  position,
  highlight,
  autoRotate,
  xray,
  onClick,
}: FemaleReproductiveProps) {
  const group = useRef<THREE.Group>(null);
  const matsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // 归一化：包围盒中心对齐原点、最大边缩放到 targetSize
  const normalized = useMemo(() => {
    const raw = build();
    const box = new THREE.Box3().setFromObject(raw);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = targetSize / Math.max(size.x, size.y, size.z, 1e-5);
    raw.position.set(-center.x, -center.y, -center.z);
    const wrap = new THREE.Group();
    wrap.add(raw);
    wrap.scale.setScalar(s);
    return wrap;
  }, [targetSize]);

  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    normalized.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.emissive = new THREE.Color(highlight ? "#20d3c2" : xray ? "#3a1518" : "#000000");
      m.emissiveIntensity = highlight ? 0.25 : xray ? 0.35 : 0;
      if (xray) {
        m.depthTest = false;
        m.transparent = true;
        m.opacity = 0.96;
        mesh.renderOrder = 999;
      }
      mats.push(m);
    });
    matsRef.current = mats;
  }, [normalized, highlight, xray]);

  const t = useRef(0);
  useFrame((_, dt) => {
    if (autoRotate && group.current) group.current.rotation.y += dt * 0.4;
    if (highlight) {
      t.current += dt;
      const pulse = 0.25 + Math.sin(t.current * 3.4) * 0.15;
      for (const m of matsRef.current) m.emissiveIntensity = pulse;
    }
  });

  return (
    <group ref={group} position={position} onClick={onClick as never}>
      <primitive object={normalized} />
    </group>
  );
}
