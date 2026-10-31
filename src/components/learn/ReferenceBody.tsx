"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { fitReferenceBody } from "@/lib/reference-body";

/** HuBMAP 体表参考模型；归一化至 1.78 米高的现有演示坐标系。 */
export function ReferenceBody({ sex, solid = false }: { sex: "male" | "female"; solid?: boolean }) {
  const { scene } = useGLTF(`/models/hra-skin-${sex}.glb`);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#d8aa96",
    roughness: 0.82,
    metalness: 0,
    transparent: !solid,
    opacity: solid ? 1 : 0.22,
    depthWrite: solid,
    side: THREE.FrontSide,
  }), [solid]);
  useEffect(() => () => material.dispose(), [material]);
  const body = useMemo(() => {
    const clone = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const fit = fitReferenceBody(bounds.min.toArray(), bounds.max.toArray());
    clone.position.set(...fit.position);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.renderOrder = solid ? 0 : 1;
      // 体表仅作参照，不阻挡对内部器官的选择。
      mesh.raycast = () => {};
    });
    const group = new THREE.Group();
    group.add(clone);
    group.scale.setScalar(fit.scale);
    return group;
  }, [scene, material, solid]);
  return <primitive object={body} />;
}
