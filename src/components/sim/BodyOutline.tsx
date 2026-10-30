"use client";

// 人体参照轮廓：
//   hologram 模式 —— 菲涅尔边缘光"全息"风格（首页英雄图、手术模拟）
//   skin 模式    —— 真实肤色人体外皮（学习中心），可淡出透视内部器官
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

// 人体半宽剖面（y: 0 脚底 → 1.78 头顶，单位米）
const PROFILE: [number, number][] = [
  [0.001, 0.0],
  [0.09, 0.015],
  [0.115, 0.06],
  [0.12, 0.12],
  [0.105, 0.4],
  [0.125, 0.52],
  [0.125, 0.82],
  [0.155, 0.93],
  [0.17, 0.99],
  [0.155, 1.08],
  [0.15, 1.16],
  [0.168, 1.28],
  [0.185, 1.36],
  [0.15, 1.46],
  [0.075, 1.52],
  [0.06, 1.56],
  [0.085, 1.62],
  [0.1, 1.7],
  [0.07, 1.76],
  [0.001, 1.78],
];

function useBodyOutlineMeshes() {
  return useMemo(() => {
    const points = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(points, 48);
    const armGeo = new THREE.CapsuleGeometry(0.042, 0.52, 6, 16);
    const breastGeo = new THREE.SphereGeometry(0.072, 20, 14);
    return { body, armGeo, breastGeo };
  }, []);
}

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// 菲涅尔边缘光：正面近乎透明，侧缘发光，形成"全息投影"效果
const hologramFragment = /* glsl */ `
  uniform vec3 uRimColor;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    float shimmer = 0.85 + 0.15 * sin(uTime * 1.6 + gl_FragCoord.x * 0.01);
    vec3 col = uRimColor * (0.25 + fres * 1.15) * shimmer;
    float alpha = 0.035 + fres * 0.42;
    gl_FragColor = vec4(col, alpha);
  }
`;

const SKIN_COLOR = "#e2a98c";

function updateOutlineMaterial(material: THREE.Material, time: number, opacity: number) {
  if (material instanceof THREE.ShaderMaterial) material.uniforms.uTime.value = time;
  else material.opacity = opacity;
}

export function BodyOutline({
  mode = "hologram",
  rimColor = "#4cc3f7",
  /** skin 模式的淡出系数 0-1（1 = 实体外皮，0.25 左右透视内部器官） */
  opacity = 1,
  /** 模型性别：女性在 skin 模式下呈现乳房轮廓 */
  sex = "male",
}: {
  mode?: "hologram" | "skin";
  rimColor?: string;
  opacity?: number;
  sex?: "male" | "female";
}) {
  const { body, armGeo, breastGeo } = useBodyOutlineMeshes();
  const current = useRef(0.92);

  const material = useMemo(() => {
    if (mode === "skin") {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(SKIN_COLOR),
        roughness: 0.62,
        metalness: 0,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      return m;
    }
    return new THREE.ShaderMaterial({
      uniforms: {
        uRimColor: { value: new THREE.Color(rimColor) },
        uTime: { value: 0 },
      },
      vertexShader,
      fragmentShader: hologramFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, [mode, rimColor]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => {
    body.dispose();
    armGeo.dispose();
    breastGeo.dispose();
  }, [body, armGeo, breastGeo]);

  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (mode === "skin") {
      // 平滑过渡到目标不透明度
      const target = THREE.MathUtils.clamp(0.92 * opacity, 0.06, 0.96);
      current.current += (target - current.current) * Math.min(1, dt * 4);
    }
    updateOutlineMaterial(material, t.current, current.current);
  });

  return (
    <group>
      <mesh geometry={body} material={material} />
      {/* 双臂：肩侧（±0.2, 1.40）向下、略向外张开 */}
      <mesh geometry={armGeo} material={material} position={[-0.2, 1.13, 0]} rotation={[0, 0, 0.1]} />
      <mesh geometry={armGeo} material={material} position={[0.2, 1.13, 0]} rotation={[0, 0, -0.1]} />
      {/* 女性乳房轮廓（真实外皮模式） */}
      {mode === "skin" && sex === "female" && (
        <>
          <mesh
            geometry={breastGeo}
            material={material}
            position={[-0.078, 1.315, 0.115]}
            scale={[1, 0.92, 0.72]}
          />
          <mesh
            geometry={breastGeo}
            material={material}
            position={[0.078, 1.315, 0.115]}
            scale={[1, 0.92, 0.72]}
          />
        </>
      )}
    </group>
  );
}
