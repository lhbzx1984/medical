import { fitReferenceBody } from "./reference-body";
/** 学习中心补充器官；仅用于人体概览，不改变手术规划支持的器官列表。 */
export type ExtraOrganId = "spleen" | "bladder" | "prostate" | "ovaries" | "mammary" | "larynx" | "trachea" | "spinalCord" | "thymus" | "fallopianTubes";
type Sex = "male" | "female";
type Info = { id: ExtraOrganId; nameZh: string; nameEn: string; system: string; brief: string; modelId: null; files: Partial<Record<Sex, string[]>>; centers: Partial<Record<Sex, [number, number, number]>>; onDemand?: boolean; focusDistance?: number };
export const EXTRA_ORGANS: Record<ExtraOrganId, Info> = {
  spleen: { id: "spleen", nameZh: "脾", nameEn: "Spleen", system: "淋巴系统", brief: "脾参与血液过滤和免疫反应。", modelId: null, files: { male: ["/models/hra-spleen-male.glb"], female: ["/models/hra-spleen-female.glb"] }, centers: { male: [0.0811, 0.3701, -0.0365], female: [0.0816, 0.3367, -0.1177] } },
  bladder: { id: "bladder", nameZh: "膀胱", nameEn: "Urinary bladder", system: "泌尿系统", brief: "膀胱储存尿液，并在排尿时将尿液排出。", modelId: null, files: { male: ["/models/hra-bladder-male.glb"], female: ["/models/hra-bladder-female.glb"] }, centers: { male: [-0.005, 0.0304, 0.0187], female: [-0.0146, 0.0041, -0.0284] } },
  prostate: { id: "prostate", nameZh: "前列腺", nameEn: "Prostate", system: "生殖系统", brief: "前列腺位于膀胱下方，参与产生精液。", modelId: null, files: { male: ["/models/hra-prostate-male.glb"] }, centers: { male: [0.004, 0.027, -0.0212] } },
  ovaries: { id: "ovaries", nameZh: "卵巢", nameEn: "Ovaries", system: "生殖系统", brief: "卵巢产生卵细胞并分泌性激素。", modelId: null, files: { female: ["/models/hra-ovary-left-female.glb", "/models/hra-ovary-right-female.glb"] }, centers: { female: [-0.0131, 0.061, -0.0455] } },
  mammary: { id: "mammary", nameZh: "乳腺", nameEn: "Mammary glands", system: "乳腺组织", brief: "乳腺由腺体、导管及周围支持组织组成。", modelId: null, files: { female: ["/models/hra-mammary-left-female.glb", "/models/hra-mammary-right-female.glb"] }, centers: { female: [-0.0057, 0.4377, 0.033] } },
  larynx: { id: "larynx", nameZh: "喉", nameEn: "Larynx", system: "呼吸系统", brief: "喉连接咽与气管，参与呼吸、发声和保护气道。", modelId: null, files: { male: ["/models/hra-larynx-male.glb"], female: ["/models/hra-larynx-female.glb"] }, centers: { male: [-0.00157, 0.66388, 0.04102], female: [-0.00935, 0.63369, -0.02331] }, onDemand: true },
  trachea: { id: "trachea", nameZh: "气管", nameEn: "Trachea", system: "呼吸系统", brief: "气管连接喉与支气管，是空气进出肺部的通道。", modelId: null, files: { male: ["/models/hra-trachea-male.glb"], female: ["/models/hra-trachea-female.glb"] }, centers: { male: [-0.00343, 0.59714, 0.02061], female: [-0.00839, 0.56935, -0.05282] }, onDemand: true },
  spinalCord: { id: "spinalCord", nameZh: "脊髓", nameEn: "Spinal cord", system: "神经系统", brief: "脊髓位于椎管内，传递脑与身体之间的神经信号。", modelId: null, files: { male: ["/models/hra-spinal-cord-male.glb"], female: ["/models/hra-spinal-cord-female.glb"] }, centers: { male: [-0.00321, 0.51709, -0.04171], female: [-0.00722, 0.50636, -0.10473] }, onDemand: true, focusDistance: 1.45 },
  thymus: { id: "thymus", nameZh: "胸腺", nameEn: "Thymus", system: "免疫系统", brief: "胸腺位于上纵隔，是 T 淋巴细胞成熟的重要场所。", modelId: null, files: { male: ["/models/hra-thymus-male.glb"], female: ["/models/hra-thymus-female.glb"] }, centers: { male: [-0.00822, 0.53799, 0.04329], female: [0.02237, 0.50592, -0.02353] }, onDemand: true },
  fallopianTubes: { id: "fallopianTubes", nameZh: "输卵管", nameEn: "Fallopian tubes", system: "生殖系统", brief: "输卵管连接子宫附近与卵巢周围区域，参与卵细胞运输。", modelId: null, files: { female: ["/models/hra-fallopian-tube-female-left.glb", "/models/hra-fallopian-tube-female-right.glb"] }, centers: { female: [-0.01258, 0.06265, -0.04515] }, onDemand: true },
};
export const EXTRA_ORGAN_LIST = Object.values(EXTRA_ORGANS);

/** HRA 单器官位于原始 HRA 体表坐标系中；映射到本项目图谱高度。 */
export function extraBodyFit(sex: Sex) {
  const min = sex === "male" ? [-0.5244569, -0.913102269, -0.16786468] : [-0.486942828, -0.7926129, -0.219068974];
  const max = sex === "male" ? [0.5186959, 0.9111738, 0.157766566] : [0.474752039, 0.865165234, 0.108037561];
  return fitReferenceBody(min, max);
}
