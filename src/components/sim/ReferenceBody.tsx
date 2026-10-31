"use client";

// 人体体表参考：
//   男性 —— BodyParts3D 皮肤（含头发、眉毛、嘴唇），本身就在图谱坐标系里，与器官注册表直接对齐；
//   女性 —— HuBMAP 女性体表参考，缩放到同一身高（BodyParts3D 图谱没有女性体表）。
// solid 为实体皮肤，否则是玻璃质的透视体表；体表仅作参照，不阻挡对内部器官的选择。
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { fitReferenceBody } from "@/lib/reference-body";
import { createBrowMaterial, createHairMaterial, createLipMaterial, createSkinMaterial } from "./realistic-materials";

export const REFERENCE_BODY_GLB = {
  male: "/models/bp3d-skin-male.glb",
  female: "/models/hra-skin-female.glb",
} as const;

export function ReferenceBody({ sex, solid = false }: { sex: "male" | "female"; solid?: boolean }) {
  const { scene } = useGLTF(REFERENCE_BODY_GLB[sex]);
  const body = useMemo(() => {
    const glass = !solid;
    const skin = createSkinMaterial({ glass });
    const materials: THREE.Material[] = [skin];
    const own = <T extends THREE.Material>(material: T) => {
      materials.push(material);
      return material;
    };
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // 男性文件里皮肤、头发、眉毛、嘴唇是四个命名网格；女性体表是单一网格。
      switch (sex === "male" ? mesh.name.toLowerCase() : "skin") {
        case "hair":
          mesh.material = own(createHairMaterial(glass));
          break;
        case "eyebrow":
          mesh.material = own(createBrowMaterial(glass));
          break;
        case "lip":
          mesh.material = own(createLipMaterial(glass));
          break;
        default:
          mesh.material = skin;
      }
      mesh.renderOrder = glass ? (mesh.material === skin ? 5 : 6) : 0;
      mesh.raycast = () => {};
    });
    const group = new THREE.Group();
    group.add(clone);
    if (sex === "female") {
      const bounds = new THREE.Box3().setFromObject(clone);
      const fit = fitReferenceBody(bounds.min.toArray(), bounds.max.toArray());
      clone.position.set(...fit.position);
      group.scale.setScalar(fit.scale);
    }
    return { group, materials };
  }, [scene, sex, solid]);
  useEffect(() => () => body.materials.forEach((material) => material.dispose()), [body]);
  return <primitive object={body.group} />;
}
