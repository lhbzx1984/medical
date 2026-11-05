"use client";

// 全身概览里的肌肉 / 骨骼 / 动脉 / 静脉层：按需加载，只在打开对应层时才下载 GLB。
// 层仅作参照，不阻挡对器官的点选。
import { useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import { ANATOMY_LAYER_IDS, ANATOMY_LAYERS, type AnatomyLayerId, type AnatomyLayerState } from "@/lib/anatomy-layers";
import * as THREE from "three";
import { createLayerMaterial } from "./realistic-materials";

function AnatomyLayer({ id, femaleHead }: { id: AnatomyLayerId; femaleHead: boolean }) {
  const { scene } = useGLTF(ANATOMY_LAYERS[id].glb);
  const layer = useMemo(() => {
    const object = scene.clone(true);
    const material = createLayerMaterial(id);
    if (id === "muscular" && femaleHead) material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.48)];
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.raycast = () => {};
    });
    return { object, material };
  }, [scene, id, femaleHead]);
  useEffect(() => () => layer.material.dispose(), [layer]);
  return <primitive object={layer.object} />;
}

export function AnatomyLayers({ layers, femaleHead = false }: { layers: AnatomyLayerState; femaleHead?: boolean }) {
  return (
    <>
      {ANATOMY_LAYER_IDS.filter((id) => layers[id]).map((id) => (
        femaleHead && id === "muscular"
          ? <AnatomyLayer key={id} id={id} femaleHead />
          : <Suspense key={id} fallback={null}><AnatomyLayer id={id} femaleHead={false} /></Suspense>
      ))}
    </>
  );
}
