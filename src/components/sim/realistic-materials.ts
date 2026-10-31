// 写实材质集中处：皮肤（含玻璃质透视体表）、毛发、嘴唇、骨骼与血管层、器官表面。
// 全身概览、学习中心与手术规划共用，避免各场景各写一套。皮肤的着色补丁是对 three.js 内置
// MeshPhysicalMaterial 着色器的字符串替换；three 升级后替换目标若变化，tests/atlas-regression 会报出。
import * as THREE from "three";
import type { AnatomyLayerId } from "@/lib/anatomy-layers";

type Shader = Parameters<THREE.Material["onBeforeCompile"]>[0];

/** 着色器里被替换的 three.js 片段；测试按此核对当前 three 版本仍含这些目标。 */
export const SKIN_SHADER_TARGETS = {
  vertex: ["#include <common>", "#include <begin_vertex>"],
  fragment: [
    "#include <common>",
    "#include <normal_fragment_maps>",
    "#include <color_fragment>",
    "#include <lights_physical_pars_fragment>",
    "#include <opaque_fragment>",
  ],
  /** lights_physical_pars_fragment 内被改成「包裹光照」的那一行 */
  diffuse: "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );",
} as const;

const NOISE_GLSL = /* glsl */ `
  varying vec3 vObjPos;
  uniform vec3 uSssColor;
  uniform float uGlassMin;
  uniform float uGlassMax;
  uniform float uGlassPow;
  float hash31(vec3 p){ p = fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x), mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x), mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float skinH(vec3 p){ return vnoise(p*900.0)*0.5 + vnoise(p*330.0)*0.35 + vnoise(p*110.0)*0.15; }
`;

// 皮肤微起伏：对象空间噪声高度 → 屏幕空间导数扰动法线；随屏幕像素密度淡出，远处保持光滑。
const SKIN_BUMP_GLSL = /* glsl */ `
  #include <normal_fragment_maps>
  {
    float px = length(fwidth(vObjPos));
    float fade = clamp(1.0 - px * 900.0 * 0.9, 0.0, 1.0);
    if (fade > 0.001) {
      float h = skinH(vObjPos);
      vec2 dH = vec2(dFdx(h), dFdy(h));
      vec3 sx = normalize(dFdx(-vViewPosition)); vec3 sy = normalize(dFdy(-vViewPosition));
      vec3 R1 = cross(sy, normal); vec3 R2 = cross(normal, sx);
      float det = dot(sx, R1);
      vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
      normal = normalize(abs(det) * normal - grad * 0.0007 * fade / max(px, 1e-4) * 0.01);
    }
  }
`;

// 肤色的低频变化：局部略偏红 / 偏黄，避免整块均匀的塑料感。
const SKIN_TINT_GLSL = /* glsl */ `
  #include <color_fragment>
  { float t = vnoise(vObjPos*28.0); float t2 = vnoise(vObjPos*7.0);
    diffuseColor.rgb *= 0.93 + 0.14 * t;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06,0.94,0.92), t2); }
`;

// 次表面近似：包裹光照，明暗交界处带红橙色。
const SKIN_WRAP_DIFFUSE = /* glsl */ `
  float wrapNL = saturate((dot(geometryNormal, directLight.direction) + 0.45) / 1.45);
  vec3 sssIrr = directLight.color * (wrapNL - dotNL);
  reflectedLight.directDiffuse += (irradiance + sssIrr * uSssColor * 0.9) * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
`;

// 菲涅尔透明：正对相机时通透，掠射角更实，得到「玻璃人」的体表。
const SKIN_GLASS_ALPHA_GLSL = /* glsl */ `
  float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), uGlassPow);
  diffuseColor.a = mix(uGlassMin, uGlassMax + 0.35, fr);
  #include <opaque_fragment>
`;

function patchSkinShader(shader: Shader, glass: boolean) {
  shader.uniforms.uSssColor = { value: new THREE.Color("#ff6a3a") };
  shader.uniforms.uGlassMin = { value: 0.06 };
  shader.uniforms.uGlassMax = { value: 0.55 };
  shader.uniforms.uGlassPow = { value: 2.2 };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${NOISE_GLSL}`)
    .replace("#include <normal_fragment_maps>", SKIN_BUMP_GLSL)
    .replace("#include <color_fragment>", SKIN_TINT_GLSL)
    .replace(
      "#include <lights_physical_pars_fragment>",
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(SKIN_SHADER_TARGETS.diffuse, SKIN_WRAP_DIFFUSE),
    );
  if (glass) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", SKIN_GLASS_ALPHA_GLSL);
}

export const SKIN_COLOR = "#cf9577";

/** 皮肤：湿润的次表面包裹光、微起伏、肤色变化；glass 为菲涅尔透明的透视体表。 */
export function createSkinMaterial({ glass = false, color = SKIN_COLOR }: { glass?: boolean; color?: string } = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.55,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#ffd9c7"),
    clearcoat: 0.12,
    clearcoatRoughness: 0.45,
    side: glass ? THREE.DoubleSide : THREE.FrontSide,
    transparent: glass,
    depthWrite: !glass,
  });
  material.onBeforeCompile = (shader) => patchSkinShader(shader, glass);
  material.customProgramCacheKey = () => `medplan-skin-${glass}`;
  return material;
}

/** 头发、眉毛、嘴唇：透视体表时略透明，不遮住内部。 */
export function createHairMaterial(glass: boolean) {
  return new THREE.MeshPhysicalMaterial({
    color: "#2a1d16",
    roughness: 0.55,
    sheen: 1,
    sheenColor: new THREE.Color("#6b4a38"),
    transparent: glass,
    opacity: glass ? 0.8 : 1,
  });
}

export function createBrowMaterial(glass: boolean) {
  return new THREE.MeshStandardMaterial({ color: "#2a1d16", roughness: 0.7, transparent: glass, opacity: glass ? 0.8 : 1 });
}

export function createLipMaterial(glass: boolean) {
  return new THREE.MeshPhysicalMaterial({
    color: "#b5605a",
    roughness: 0.35,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
    transparent: glass,
    opacity: glass ? 0.85 : 1,
  });
}

/** 骨骼、动脉、静脉层的材质（颜色为教学惯例：动脉红、静脉蓝、骨骼象牙白）。 */
export function createLayerMaterial(id: AnatomyLayerId) {
  switch (id) {
    case "skeletal":
      return new THREE.MeshPhysicalMaterial({
        color: "#e6d9bd",
        roughness: 0.62,
        clearcoat: 0.15,
        clearcoatRoughness: 0.5,
        sheen: 0.2,
        sheenColor: new THREE.Color("#fff2d6"),
      });
    case "arterial":
      return new THREE.MeshPhysicalMaterial({ color: "#b3262b", roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    case "venous":
      return new THREE.MeshPhysicalMaterial({ color: "#3f5aa6", roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  }
}

type SurfacePreset = Partial<Pick<THREE.MeshPhysicalMaterial, "clearcoat" | "clearcoatRoughness" | "roughness" | "sheen">>;

/** 各器官的表面：实质脏器与黏膜湿润、有清漆高光，肺略带绒感，眼球近似玻璃体。 */
const ORGAN_SURFACE: Record<string, SurfacePreset> = {
  liver: { clearcoat: 0.55, clearcoatRoughness: 0.28, roughness: 0.42, sheen: 0.2 },
  heart: { clearcoat: 0.35, clearcoatRoughness: 0.35, roughness: 0.5, sheen: 0.15 },
  lungs: { clearcoat: 0.25, clearcoatRoughness: 0.4, roughness: 0.55, sheen: 0.4 },
  brain: { clearcoat: 0.6, clearcoatRoughness: 0.25, roughness: 0.4, sheen: 0.1 },
  kidneys: { clearcoat: 0.6, clearcoatRoughness: 0.25, roughness: 0.38, sheen: 0.1 },
  intestine: { clearcoat: 0.55, clearcoatRoughness: 0.3, roughness: 0.4, sheen: 0.15 },
  stomach: { clearcoat: 0.5, clearcoatRoughness: 0.3, roughness: 0.42, sheen: 0.15 },
  pancreas: { clearcoat: 0.3, clearcoatRoughness: 0.4, roughness: 0.5, sheen: 0.2 },
  eyeball: { clearcoat: 1, clearcoatRoughness: 0.05, roughness: 0.25, sheen: 0 },
};
const DEFAULT_ORGAN_SURFACE: SurfacePreset = { clearcoat: 0.3, clearcoatRoughness: 0.4 };

/** 保留 GLB 原有颜色与贴图，叠加器官表面的湿润高光，返回新的材质（不改动源材质）。 */
export function createOrganMaterial(source: THREE.Material, organId: string) {
  const material = new THREE.MeshPhysicalMaterial();
  if (source instanceof THREE.MeshStandardMaterial) {
    // 用基类的 copy：MeshPhysicalMaterial.copy 会读取源材质没有的 clearcoat / sheen 向量而报错。
    THREE.MeshStandardMaterial.prototype.copy.call(material, source);
  } else {
    material.color.set("#c46a64");
  }
  material.metalness = 0;
  Object.assign(material, ORGAN_SURFACE[organId] ?? DEFAULT_ORGAN_SURFACE);
  material.sheenColor = new THREE.Color("#ffb4a8");
  material.sheenRoughness = 0.6;
  return material;
}

/** Three.js 场景由渲染循环管理，不是 React 的渲染状态。 */
export function setSceneEnvironment(scene: THREE.Scene, environment: THREE.Texture | null, intensity: number) {
  scene.environment = environment;
  scene.environmentIntensity = intensity;
}
