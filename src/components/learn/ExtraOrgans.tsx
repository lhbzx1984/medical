"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { EXTRA_ORGAN_LIST, extraBodyFit, type ExtraOrganId } from "@/lib/extra-organs";

function ExtraMesh({ path, selected, dimmed, mammary, onSelect }: { path: string; selected: boolean; dimmed: boolean; mammary: boolean; onSelect: () => void }) {
  const { scene } = useGLTF(path);
  const model = useMemo(() => {
    const copy = scene.clone(true);
    const materials: THREE.Material[] = [];
    copy.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const clone = (original: THREE.Material) => {
        const material = original.clone();
        if (material instanceof THREE.MeshStandardMaterial) {
          // 原始乳腺参考模型使用高饱和颜色；采用柔和色以改善人体同屏可读性。
          if (mammary) material.color.set("#c58c83");
          if (selected) { material.emissive.set("#147e75"); material.emissiveIntensity = 0.18; }
        }
        if (dimmed || (mammary && !selected)) {
          material.transparent = true;
          material.opacity = dimmed ? 0.12 : 0.18;
          material.depthWrite = false;
        }
        materials.push(material); return material;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
    });
    return { copy, materials };
  }, [scene, selected, dimmed, mammary]);
  useEffect(() => () => model.materials.forEach((material) => material.dispose()), [model]);
  return <primitive object={model.copy} onClick={(event: { stopPropagation: () => void }) => { event.stopPropagation(); onSelect(); }} />;
}

export function ExtraOrgans({ sex, selected, onSelect }: { sex: "male" | "female"; selected: ExtraOrganId | null; onSelect: (id: ExtraOrganId) => void }) {
  const fit = extraBodyFit(sex);
  return <group scale={fit.scale}>
    <group position={fit.position}>
      {EXTRA_ORGAN_LIST.filter((organ) => !organ.onDemand || selected === organ.id).flatMap((organ) => (organ.files[sex] ?? []).map((path) => (
        <Suspense key={path} fallback={null}><ExtraMesh path={path} selected={selected === organ.id} dimmed={selected !== null && selected !== organ.id} mammary={organ.id === "mammary"} onSelect={() => onSelect(organ.id)} /></Suspense>
      )))}
    </group>
  </group>;
}
