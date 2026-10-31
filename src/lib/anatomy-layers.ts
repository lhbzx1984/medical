// 全身概览里可单独打开的解剖层：骨骼、动脉、静脉。
// 三个 GLB 由 scripts/extract-body-layers-glb.mjs 从精细图谱（BodyParts3D 4.0 男性，CC BY 4.0）生成，
// 与器官注册表同在图谱坐标系，无需再配准。
export const ANATOMY_LAYER_IDS = ["skeletal", "arterial", "venous"] as const;

export type AnatomyLayerId = (typeof ANATOMY_LAYER_IDS)[number];
export type AnatomyLayerState = Record<AnatomyLayerId, boolean>;

export const ANATOMY_LAYERS: Record<AnatomyLayerId, { nameZh: string; glb: string }> = {
  skeletal: { nameZh: "骨骼", glb: "/models/bp3d-skeleton-male.glb" },
  arterial: { nameZh: "动脉", glb: "/models/bp3d-arteries-male.glb" },
  venous: { nameZh: "静脉", glb: "/models/bp3d-veins-male.glb" },
};

export const NO_ANATOMY_LAYERS: AnatomyLayerState = { skeletal: false, arterial: false, venous: false };
