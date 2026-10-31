"use client";

// 全身概览里的骨骼 / 动脉 / 静脉层：按需加载，只在打开对应层时才下载 GLB。
// 层仅作参照，不阻挡对器官的点选。
import { useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import { ANATOMY_LAYER_IDS, ANATOMY_LAYERS, type AnatomyLayerId, type AnatomyLayerState } from "@/lib/anatomy-layers";
import * as THREE from "three";
import { createLayerMaterial } from "./realistic-materials";

function AnatomyLayer({ id }: { id: AnatomyLayerId }) {
  const { scene } = useGLTF(ANATOMY_LAYERS[id].glb);
  const layer = useMemo(() => {
    const object = scene.clone(true);
    const material = createLayerMaterial(id);
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.raycast = () => {};
    });
    return { object, material };
  }, [scene, id]);
  useEffect(() => () => layer.material.dispose(), [layer]);
  return <primitive object={layer.object} />;
}

export function AnatomyLayers({ layers }: { layers: AnatomyLayerState }) {
  return (
    <>
      {ANATOMY_LAYER_IDS.filter((id) => layers[id]).map((id) => (
        <Suspense key={id} fallback={null}>
          <AnatomyLayer id={id} />
        </Suspense>
      ))}
    </>
  );
}
