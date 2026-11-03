/** 女性体表前面区域的教学示意点；位置对应 MakeHuman 体表，并非精确分区边界。 */
export const SURFACE_REGION_GROUPS = [
  { name: "头面部", regions: [
    { name: "额区", position: [0, 1.645, 0.065] },
    { name: "颞区", position: [-0.065, 1.625, 0.045] },
    { name: "眶区", position: [-0.033, 1.606, 0.075] },
    { name: "眶下区", position: [-0.035, 1.59, 0.08] },
    { name: "鼻区", position: [0, 1.59, 0.10] },
    { name: "颧区", position: [0.052, 1.59, 0.07] },
    { name: "口区", position: [0, 1.56, 0.09] },
    { name: "颏区", position: [0, 1.545, 0.075] },
  ] },
  { name: "颈部", regions: [
    { name: "颈前区", position: [0, 1.49, 0.07] },
    { name: "颈外侧区", position: [0.055, 1.49, 0.035] },
    { name: "胸锁乳突肌区", position: [-0.045, 1.48, 0.06] },
  ] },
  { name: "胸腹部", regions: [
    { name: "锁骨下区", position: [0.095, 1.40, 0.08] },
    { name: "胸骨前区", position: [0, 1.30, 0.11] },
    { name: "乳房区", position: [-0.085, 1.29, 0.14] },
    { name: "乳房下区", position: [-0.085, 1.225, 0.10] },
    { name: "胸外侧区", position: [0.14, 1.26, 0.055] },
    { name: "季肋区", position: [0.09, 1.16, 0.09] },
    { name: "腹上区", position: [0, 1.13, 0.10] },
    { name: "脐区", position: [0, 1.02, 0.105] },
    { name: "腰区", position: [0.12, 1.02, 0.04] },
    { name: "腹下区", position: [0, 0.90, 0.09] },
    { name: "腹股沟区", position: [0.09, 0.865, 0.07] },
    { name: "髂区", position: [0.16, 0.89, 0.02] },
  ] },
  { name: "上肢", regions: [
    { name: "三角肌区", position: [-0.20, 1.39, 0.03] },
    { name: "腋窝区", position: [0.16, 1.32, 0.05] },
    { name: "臂前区", position: [0.235, 1.29, 0.04] },
    { name: "肘前区", position: [0.305, 1.16, 0.04] },
    { name: "前臂前区", position: [-0.36, 1.07, 0.04] },
    { name: "掌区", position: [0.48, 0.96, 0.05] },
  ] },
  { name: "下肢", regions: [
    { name: "股三角区", position: [-0.10, 0.81, 0.09] },
    { name: "大腿前区", position: [-0.12, 0.68, 0.10] },
    { name: "膝前区", position: [0.105, 0.46, 0.09] },
    { name: "小腿前区", position: [-0.105, 0.30, 0.07] },
    { name: "足背区", position: [0.11, 0.055, 0.10] },
  ] },
] as const;

/** 背面区域为教学用近似位置，不构成精确体表边界。 */
export const POSTERIOR_REGION_GROUPS = [
  { name: "头颈部", regions: [
    { name: "枕区", position: [0, 1.65, -0.09] },
    { name: "颈后区", position: [0, 1.49, -0.09] },
  ] },
  { name: "背部", regions: [
    { name: "肩胛区", position: [0.10, 1.35, -0.10] },
    { name: "脊柱区", position: [0, 1.23, -0.10] },
    { name: "腰背区", position: [-0.08, 1.04, -0.10] },
    { name: "骶区", position: [0, 0.91, -0.12] },
    { name: "臀区", position: [-0.095, 0.82, -0.13] },
  ] },
  { name: "上肢", regions: [
    { name: "臂后区", position: [0.235, 1.29, -0.07] },
    { name: "肘后区", position: [0.305, 1.16, -0.07] },
    { name: "前臂后区", position: [-0.36, 1.07, -0.06] },
    { name: "手背区", position: [0.48, 0.96, -0.05] },
  ] },
  { name: "下肢", regions: [
    { name: "大腿后区", position: [-0.12, 0.68, -0.12] },
    { name: "腘区", position: [0.105, 0.46, -0.10] },
    { name: "小腿后区", position: [-0.105, 0.30, -0.10] },
    { name: "足跟区", position: [0.15, 0.06, -0.10] },
  ] },
] as const;
export type SurfaceSide = "front" | "back";
export type SurfaceRegion = (typeof SURFACE_REGION_GROUPS)[number]["regions"][number] | (typeof POSTERIOR_REGION_GROUPS)[number]["regions"][number];
