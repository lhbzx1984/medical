import { fitReferenceBody } from "./reference-body";
/** 学习中心补充器官；仅用于人体概览，不改变手术规划支持的器官列表。 */
export type ExtraOrganId = "spleen" | "bladder" | "prostate" | "ovaries" | "mammary";
type Sex = "male" | "female";
type Info = { id: ExtraOrganId; nameZh: string; nameEn: string; system: string; brief: string; modelId: null; files: Partial<Record<Sex, string[]>>; centers: Partial<Record<Sex, [number, number, number]>> };
export const EXTRA_ORGANS: Record<ExtraOrganId, Info> = {
  spleen: { id: "spleen", nameZh: "脾", nameEn: "Spleen", system: "淋巴系统", brief: "脾参与血液过滤和免疫反应。", modelId: null, files: { male: ["/models/hra-spleen-male.glb"], female: ["/models/hra-spleen-female.glb"] }, centers: { male: [0.0811, 0.3701, -0.0365], female: [0.0816, 0.3367, -0.1177] } },
  bladder: { id: "bladder", nameZh: "膀胱", nameEn: "Urinary bladder", system: "泌尿系统", brief: "膀胱储存尿液，并在排尿时将尿液排出。", modelId: null, files: { male: ["/models/hra-bladder-male.glb"], female: ["/models/hra-bladder-female.glb"] }, centers: { male: [-0.005, 0.0304, 0.0187], female: [-0.0146, 0.0041, -0.0284] } },
  prostate: { id: "prostate", nameZh: "前列腺", nameEn: "Prostate", system: "生殖系统", brief: "前列腺位于膀胱下方，参与产生精液。", modelId: null, files: { male: ["/models/hra-prostate-male.glb"] }, centers: { male: [0.004, 0.027, -0.0212] } },
  ovaries: { id: "ovaries", nameZh: "卵巢", nameEn: "Ovaries", system: "生殖系统", brief: "卵巢产生卵细胞并分泌性激素。", modelId: null, files: { female: ["/models/hra-ovary-left-female.glb", "/models/hra-ovary-right-female.glb"] }, centers: { female: [-0.0131, 0.061, -0.0455] } },
  mammary: { id: "mammary", nameZh: "乳腺", nameEn: "Mammary glands", system: "乳腺组织", brief: "乳腺由腺体、导管及周围支持组织组成。", modelId: null, files: { female: ["/models/hra-mammary-left-female.glb", "/models/hra-mammary-right-female.glb"] }, centers: { female: [-0.0057, 0.4377, 0.033] } },
};
export const EXTRA_ORGAN_LIST = Object.values(EXTRA_ORGANS);

/** HRA 单器官位于原始 HRA 体表坐标系中；映射到本项目图谱高度。 */
export function extraBodyFit(sex: Sex) {
  const min = sex === "male" ? [-0.5244569, -0.913102269, -0.16786468] : [-0.486942828, -0.7926129, -0.219068974];
  const max = sex === "male" ? [0.5186959, 0.9111738, 0.157766566] : [0.474752039, 0.865165234, 0.108037561];
  return fitReferenceBody(min, max);
}
