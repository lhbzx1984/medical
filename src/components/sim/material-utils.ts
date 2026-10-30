import type { MeshStandardMaterial } from "three";

// Three.js 材质由渲染循环管理，不是 React 的渲染状态。
export function setEmissiveIntensity(materials: MeshStandardMaterial[], intensity: number) {
  for (const material of materials) material.emissiveIntensity = intensity;
}
