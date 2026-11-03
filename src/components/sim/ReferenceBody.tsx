"use client";

// 人体体表参考：
//   男性 —— BodyParts3D 皮肤（含头发、眉毛、嘴唇），本身就在图谱坐标系里，与器官注册表直接对齐；
//   女性 —— MakeHuman 女性体表参考，缩放到同一身高（BodyParts3D 图谱没有女性体表）。
// solid 为实体皮肤，否则是玻璃质的透视体表；体表仅作参照，不阻挡对内部器官的选择。
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { fitReferenceBody } from "@/lib/reference-body";
import { createBrowMaterial, createHairMaterial, createLipMaterial, createSkinMaterial } from "./realistic-materials";

export const REFERENCE_BODY_GLB = {
  male: "/models/bp3d-skin-male.glb",
  female: "/models/makehuman-female-detailed.glb",
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
      if (sex === "female") {
        const original = mesh.material as THREE.MeshStandardMaterial;
        if (glass) { mesh.visible = original.name === "Skin"; mesh.material = skin; }
        else { mesh.material = own(original.clone()); }
        mesh.raycast = () => {};
        return;
      }
      // 男性文件里皮肤、头发、眉毛、嘴唇是四个命名网格。
      switch (mesh.name.toLowerCase()) {
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
    // 按人体模型包围盒拟合至共享场景，器官仍为不同参考个体。
    const skinBounds = sex === "female" ? new THREE.Box3().setFromObject(clone) : null;
    const group = new THREE.Group();
    group.add(clone);
    if (skinBounds) {
      const fit = fitReferenceBody(skinBounds.min.toArray(), skinBounds.max.toArray());
      clone.position.set(...fit.position);
      group.scale.setScalar(fit.scale);
    }
    return { group, materials };
  }, [scene, sex, solid]);
  useEffect(() => () => {
    body.materials.forEach((material) => material.dispose());
  }, [body]);
  return <primitive object={body.group} />;
}
