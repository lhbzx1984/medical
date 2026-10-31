"use client";

// 通用 3D 器官模型：加载 GLB（Meshopt）、归一化尺寸并居中、支持高亮/调暗/半透明外壳。
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import type { OrganInfo } from "@/lib/organ-models";
import { setEmissiveIntensity } from "./material-utils";

export interface OrganModelProps {
  organ: OrganInfo;
  /** 目标最大边长（米）。默认 organ.bodySize */
  targetSize?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** 高亮脉冲（如模拟聚焦的器官） */
  highlight?: boolean;
  /** 半透明调暗（非当前聚焦器官） */
  dimmed?: boolean;
  /** 作为透明体表外壳渲染 */
  shell?: boolean;
  autoRotate?: boolean;
  onClick?: (e: { stopPropagation: () => void }) => void;
}

export function OrganModel({
  organ,
  targetSize,
  position,
  rotation,
  highlight,
  dimmed,
  shell,
  autoRotate,
  onClick,
}: OrganModelProps) {
  const { scene } = useGLTF(organ.glb, false, true); // 不用 Draco，启用 Meshopt
  const group = useRef<THREE.Group>(null);
  const matsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // 克隆场景并归一化：中心对齐原点、最大边长缩放到 targetSize
  const normalized = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = (targetSize ?? organ.bodySize) / Math.max(size.x, size.y, size.z, 1e-4);
    clone.position.set(-center.x, -center.y, -center.z);
    const wrap = new THREE.Group();
    wrap.add(clone);
    wrap.scale.setScalar(s);
    const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) originalMaterials.set(mesh, mesh.material);
    });
    return { object: wrap, originalMaterials };
  }, [scene, organ.bodySize, targetSize]);

  // 材质克隆与基础状态（外壳/调暗）。
  // ⚠️ 必须保持原始材质的形态：GLB 几何体没有 groups 时，把单个材质包装成
  //    数组会导致渲染器 0 次绘制（three.js 的 material 数组按 geometry.groups 分组绘制）。
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = [];
    normalized.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const make = (m: THREE.Material) => {
        const mm = (m as THREE.MeshStandardMaterial).clone();
        mm.metalness = 0;
        // 保留模型原色作为基准，针对参考肝脏略微提亮以适配深色视口。
        if (organ.id === "liver" && organ.closeupGlb && organ.glb === organ.closeupGlb && mm.color) {
          const original = typeof m.userData?.referenceBaseColor === "number" ? m.userData.referenceBaseColor : mm.color.getHex();
          mm.userData.referenceBaseColor = original;
          mm.color.setHex(original).multiplyScalar(2);
        }
        mm.emissive = new THREE.Color(highlight ? "#20d3c2" : "#000000");
        mm.emissiveIntensity = highlight ? 0.22 : 0;
        if (shell) {
          mm.transparent = true;
          mm.opacity = 0.14;
          mm.depthWrite = false;
          mm.side = THREE.DoubleSide;
          mm.roughness = 0.85;
          mm.color = new THREE.Color("#a8cfe0");
        } else if (dimmed) {
          mm.transparent = true;
          mm.opacity = 0.22;
          mm.depthWrite = false;
        } else {
          mm.transparent = false;
          mm.opacity = 1;
          mm.depthWrite = true;
        }
        if (mm instanceof THREE.MeshStandardMaterial) mats.push(mm);
        return mm;
      };
      const original = normalized.originalMaterials.get(mesh)!;
      mesh.material = Array.isArray(original) ? original.map(make) : make(original);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    matsRef.current = mats;
    return () => mats.forEach((material) => material.dispose());
  }, [normalized, shell, dimmed, highlight, organ.id, organ.closeupGlb, organ.glb]);

  // 高亮脉冲
  const t = useRef(0);
  useFrame((_, dt) => {
    if (autoRotate && group.current) {
      group.current.rotation.y += dt * 0.4;
    }
    if (highlight) {
      t.current += dt;
      const pulse = 0.22 + Math.sin(t.current * 3.4) * 0.16;
      setEmissiveIntensity(matsRef.current, pulse);
    }
  });

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      onClick={
        onClick as never
      }
    >
      <primitive object={normalized.object} />
    </group>
  );
}
