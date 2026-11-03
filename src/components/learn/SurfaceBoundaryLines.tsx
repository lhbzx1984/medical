"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { fitReferenceBody } from "@/lib/reference-body";
import { REFERENCE_BODY_GLB } from "@/components/sim/ReferenceBody";
import type { SurfaceSide } from "@/lib/surface-regions";

// 正面投影轮廓仅用于教学示意，不是医学测量或精确边界。
type Point = readonly [number, number];
const ellipse = (cx: number, cy: number, rx: number, ry: number): Point[] =>
  Array.from({ length: 25 }, (_, i) => [cx + rx * Math.cos(i * Math.PI / 12), cy + ry * Math.sin(i * Math.PI / 12)]);
const PATHS: readonly (readonly Point[])[] = [
  ellipse(-.085, 1.29, .050, .050), ellipse(.085, 1.29, .050, .050),
  ellipse(-.032, 1.605, .019, .011), ellipse(.032, 1.605, .019, .011),
  [[-.018,1.57],[0,1.56],[.018,1.57]],
  [[-.08,1.42],[0,1.35],[.08,1.42]],
  [[-.07,1.49],[0,1.39],[.07,1.49]],
  [[0,1.40],[0,1.18]],
  [[-.16,1.35],[-.13,1.29],[-.10,1.20],[0,1.18],[.10,1.20],[.13,1.29],[.16,1.35]],
  [[-.12,1.18],[-.09,1.12],[-.08,1.03],[-.10,.91]],
  [[.12,1.18],[.09,1.12],[.08,1.03],[.10,.91]],
  [[-.13,1.10],[0,1.10],[.13,1.10]],
  [[-.14,.91],[0,.89],[.14,.91]],
  [[-.14,.91],[-.07,.83],[0,.78],[.07,.83],[.14,.91]],
  [[-.14,.90],[-.09,.77],[-.08,.69]],
  [[.14,.90],[.09,.77],[.08,.69]],
  [[-.16,1.37],[-.22,1.33]], [[.16,1.37],[.22,1.33]],
  [[-.25,1.25],[-.30,1.28]], [[.25,1.25],[.30,1.28]],
  [[-.32,1.15],[-.36,1.18]], [[.32,1.15],[.36,1.18]],
  [[-.43,1.02],[-.46,1.05]], [[.43,1.02],[.46,1.05]],
  [[-.17,.48],[-.08,.48]], [[.08,.48],[.17,.48]],
  [[-.16,.42],[-.08,.42]], [[.08,.42],[.16,.42]],
  [[-.14,.075],[-.07,.075]], [[.07,.075],[.14,.075]],
];

const BACK_PATHS: readonly (readonly Point[])[] = [
  [[-.075,1.46],[0,1.40],[.075,1.46]],
  [[0,1.40],[0,.91]],
  [[-.16,1.35],[-.11,1.26],[-.06,1.21],[0,1.24],[.06,1.21],[.11,1.26],[.16,1.35]],
  [[-.13,1.10],[0,1.10],[.13,1.10]],
  [[-.14,.94],[0,.91],[.14,.94]],
  [[-.15,.86],[-.10,.78],[0,.76],[.10,.78],[.15,.86]],
  [[-.20,1.34],[-.25,1.31]], [[.20,1.34],[.25,1.31]],
  [[-.30,1.17],[-.34,1.14]], [[.30,1.17],[.34,1.14]],
  [[-.43,1.03],[-.46,1.00]], [[.43,1.03],[.46,1.00]],
  [[-.17,.48],[-.08,.48]], [[.08,.48],[.17,.48]],
  [[-.16,.42],[-.08,.42]], [[.08,.42],[.16,.42]],
];

export default function SurfaceBoundaryLines({ side }: { side: SurfaceSide }) {
  const { scene } = useGLTF(REFERENCE_BODY_GLB.female);
  const geometry = useMemo(() => {
    const model = scene.clone(true);
    const box = new THREE.Box3().setFromObject(model);
    const fit = fitReferenceBody(box.min.toArray(), box.max.toArray());
    model.position.set(...fit.position);
    const wrapper = new THREE.Group();
    wrapper.add(model);
    wrapper.scale.setScalar(fit.scale);
    wrapper.updateMatrixWorld(true);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      // 仅投影到皮肤；头发和眼部不是体表分区的测量表面。
      if (!Array.isArray(mesh.material) && mesh.material.name === "Skin") mesh.material = material;
      else mesh.raycast = () => {};
    });
    const ray = new THREE.Raycaster();
    const direction = new THREE.Vector3(0, 0, side === "front" ? -1 : 1);
    const vertices: number[] = [];
    for (const path of side === "front" ? PATHS : BACK_PATHS) {
      let previous: THREE.Vector3 | null = null;
      for (let segment = 0; segment < path.length - 1; segment++) {
        const [x0, y0] = path[segment];
        const [x1, y1] = path[segment + 1];
        const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.008));
        for (let i = segment ? 1 : 0; i <= steps; i++) {
          const t = i / steps;
          ray.set(new THREE.Vector3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, side === "front" ? 2 : -2), direction);
          const hit = ray.intersectObject(wrapper, true)[0];
          const point = hit ? hit.point.clone().addScaledVector(direction, -0.0025) : null;
          if (point && previous && point.distanceTo(previous) < 0.04) vertices.push(...previous.toArray(), ...point.toArray());
          previous = point;
        }
      }
    }
    material.dispose();
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    return result;
  }, [scene, side]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineSegments geometry={geometry} raycast={() => {}}><lineBasicMaterial color="#b15457" transparent opacity={0.9} depthWrite={false} /></lineSegments>;
}
