// 3D 器官模型注册表。
// 特写使用注明来源的参考模型；全身视图使用已配准的原始模型。
// 其他 GLB 与缩略图来自 thebuggeddev/anatomy；stomach.glb 由 BodyParts3D 精细图谱转换。
// bodyPosition / bodySize 用于「人体概览」场景中的解剖学摆放：
//   坐标系为 Y 轴向上、单位米、标准站立人体身高约 1.75m，面朝 +Z；+X 为患者左侧（与精细图谱一致）。
//   bodyRotation（可选）：GLB 自身朝向与图谱不同的器官在概览里绕竖直轴的旋转；器官特写与器官级视图仍按 GLB 原始朝向。
import { ORGAN_IDS, type OrganId } from "./types";

export interface OrganInfo {
  id: OrganId;
  nameZh: string;
  nameEn: string;
  system: string;
  /** 一句话介绍（注入 AI 上下文与 UI 说明） */
  brief: string;
  /** GLB 路径；程序化器官（procedural）留空 */
  glb: string;
  referenceLabel?: string;
  closeupGlb?: string;
  /** 概览中需独立配准的左右器官（如左右肾） */
  bodyParts?: { glb: string; position: [number, number, number]; size: number }[];
  thumb: string;
  organImg: string;
  /** 概览场景中的中心位置 */
  bodyPosition: [number, number, number];
  /** 概览场景中的目标最大尺寸（米） */
  bodySize: number;
  /** 概览场景中的旋转（弧度，缺省不旋转）；绕包围盒中心，不改变 bodyPosition 与 bodySize 的含义 */
  bodyRotation?: [number, number, number];
  /** 概览中是否作为半透明体表外壳渲染 */
  isShell?: boolean;
  /** 程序化建模（无 GLB，如女性子宫附件） */
  procedural?: boolean;
  /** 仅女性模型呈现 */
  femaleOnly?: boolean;
}

export const ORGANS: Record<OrganId, OrganInfo> = {
  brain: {
    id: "brain",
    nameZh: "脑",
    nameEn: "Brain",
    system: "神经系统",
    brief:
      "中枢神经系统的核心器官，由大脑、小脑与脑干组成，主导感知、运动、记忆、语言与内脏调节。",
    glb: "/models/brain.glb",
    closeupGlb: "/models/hra-brain-male.glb",
    referenceLabel: "HuBMAP 男性参考器官模型",
    thumb: "/anatomy/brain/thumb.webp",
    organImg: "/anatomy/brain/organ.webp",
    // 取自精细图谱脑结构（含小脑、脑干）的包围盒：最长边为前后长 0.18，x 中心取 0。GLB 的前后轴在 x 上（枕后朝 +x），
    // 概览里绕竖直轴转 +90° 使枕后朝 -Z。人形轮廓的头部（颈最细 1.56、头顶 1.78）比图谱头部（下颌 1.50、头顶 1.719）整体高 0.06，
    // 故 y 取图谱中心 1.626 加 0.06；z 取 -0.01（图谱 -0.02，轮廓中轴 0），个别顶点超出轮廓不超过 0.4 cm。
    bodyPosition: [0, 1.686, -0.01],
    bodySize: 0.18,
    bodyRotation: [0, Math.PI / 2, 0],
  },
  eyeball: {
    id: "eyeball",
    nameZh: "眼球",
    nameEn: "Eyeball",
    system: "感觉器官",
    brief: "视觉感受器，光线经角膜、晶状体折射后在视网膜成像，转换为神经冲动。",
    glb: "/models/eyeball.glb",
    closeupGlb: "/models/hra-eye-male-left.glb",
    referenceLabel: "HuBMAP 男性左眼参考模型",
    thumb: "/anatomy/eyeball/thumb.webp",
    organImg: "/anatomy/eyeball/organ.webp",
    // 取自精细图谱左眼（巩膜+角膜）：球径 0.026，x 中心 0.029。GLB 末端约 20% 是视神经残端（朝后内侧），球体中心比包围盒中心靠前 0.003，
    // bodySize 取 0.032 使球径为 0.026；绕竖直轴转 +90° 使角膜朝前（+Z）、视神经朝后内侧。位置随轮廓头部上移 0.06、前移 0.01（同脑）。
    bodyPosition: [0.028, 1.656, 0.059],
    bodySize: 0.032,
    bodyRotation: [0, Math.PI / 2, 0],
  },
  heart: {
    id: "heart",
    nameZh: "心脏",
    nameEn: "Heart",
    system: "循环系统",
    brief: "四腔肌性泵，驱动肺循环与体循环；瓣膜保证血液单向流动。",
    glb: "/models/heart.glb",
    closeupGlb: "/models/hra-heart-male.glb",
    referenceLabel: "HuBMAP 男性参考器官模型",
    thumb: "/anatomy/heart/thumb.webp",
    organImg: "/anatomy/heart/organ.webp",
    // x 取自精细图谱心腔与心房壁的包围盒中心（偏患者左侧）
    bodyPosition: [0.017, 1.3, 0.025],
    bodySize: 0.15,
  },
  lungs: {
    id: "lungs",
    nameZh: "肺",
    nameEn: "Lungs",
    system: "呼吸系统",
    brief: "气体交换场所，支气管树逐级分支至肺泡，氧气与二氧化碳在此交换。",
    glb: "/models/lungs.glb",
    closeupGlb: "/models/hra-lung-male.glb",
    referenceLabel: "HuBMAP 男性参考器官模型",
    thumb: "/anatomy/lungs/thumb.webp",
    organImg: "/anatomy/lungs/organ.webp",
    // 图谱没有肺实质网格，按肋骨与气道取值：肺体宽 0.25（第 1—10 肋外包围盒宽 0.273，两侧各留 1.1 cm；图谱段支气管树宽 0.239，被包在肺内），
    // 肺体居中于段支气管树的中心 y 1.317。GLB 顶部约 17.5% 是气管残端，包围盒中心比肺体中心高 0.024，故 y 取 1.341；
    // 残端顶端 1.476 与图谱气管上端 1.473 相差不到 0.5 cm。
    bodyPosition: [0, 1.341, 0],
    bodySize: 0.271,
  },
  liver: {
    id: "liver",
    nameZh: "肝",
    nameEn: "Liver",
    system: "消化系统",
    brief: "最大实质器官，位于右膈下；参与代谢、解毒、胆汁生成与血浆蛋白合成。",
    glb: "/models/liver.glb",
    closeupGlb: "/models/hra-liver-male.glb",
    referenceLabel: "HuBMAP 男性参考器官模型",
    thumb: "/anatomy/liver/thumb.webp",
    organImg: "/anatomy/liver/organ.webp",
    // 取自精细图谱各肝段的包围盒中心与最大边长（米）：右叶在患者右侧，左叶越过中线，故 x 略偏右。
    // 本模型顶部约 17.5% 是下腔静脉等血管残端，包围盒中心比肝实质中心高约 1.8 cm，故 y 比图谱中心 1.184 高 0.018。
    bodyPosition: [-0.01, 1.202, 0.023],
    bodySize: 0.21,
  },
  pancreas: {
    id: "pancreas",
    nameZh: "胰",
    nameEn: "Pancreas",
    system: "消化/内分泌",
    brief: "兼具外分泌（胰酶）与内分泌（胰岛素、胰高血糖素）功能的腹膜后器官。",
    glb: "/models/pancreas.glb",
    closeupGlb: "/models/hra-pancreas-male.glb",
    referenceLabel: "HuBMAP 男性参考器官模型",
    thumb: "/anatomy/pancreas/thumb.webp",
    organImg: "/anatomy/pancreas/organ.webp",
    // 取自精细图谱胰腺的包围盒中心与最大边长（米）：胰头在患者右侧、胰尾伸向左侧，故 x 略偏左。
    bodyPosition: [0.012, 1.119, 0.021],
    bodySize: 0.121,
  },
  kidneys: {
    id: "kidneys",
    nameZh: "肾",
    nameEn: "Kidneys",
    system: "泌尿系统",
    brief: "成对腹膜后器官，过滤血液、调节水盐与酸碱平衡，生成尿液经输尿管排出。",
    glb: "/models/kidneys.glb",
    closeupGlb: "/models/innerscene-kidneys.glb",
    referenceLabel: "Innerscene 示意模型",
    // 精细图谱左右肾的包围盒中心与最长边；+X 为患者左侧。
    bodyParts: [
      { glb: "/models/hra-kidney-left-male.glb", position: [0.0616, 1.1156, -0.0201], size: 0.1059 },
      { glb: "/models/hra-kidney-right-male.glb", position: [-0.0590, 1.0971, -0.0117], size: 0.1044 },
    ],
    thumb: "/anatomy/kidneys/thumb.webp",
    organImg: "/anatomy/kidneys/organ.webp",
    // 单体模型的旧定位保留给标签、相机与原模型；概览使用上方独立配准的左右肾。
    bodyPosition: [0, 1.1, -0.014],
    bodySize: 0.178,
  },
  intestine: {
    id: "intestine",
    nameZh: "肠",
    nameEn: "Intestines",
    system: "消化系统",
    brief: "小肠与大肠构成消化管下段，负责吸收营养与水分、成形并排出粪便。",
    glb: "/models/intestine.glb",
    closeupGlb: "/models/innerscene-intestine.glb",
    referenceLabel: "Innerscene 示意模型",
    thumb: "/anatomy/intestine/thumb.webp",
    organImg: "/anatomy/intestine/organ.webp",
    bodyPosition: [0, 0.995, 0.01],
    bodySize: 0.32,
  },
  stomach: {
    id: "stomach",
    nameZh: "胃",
    nameEn: "Stomach",
    system: "消化系统",
    brief: "连接食管与十二指肠的肌性消化器官，具有储存食物、混合与初步消化的功能；可分为贲门、胃底、胃体与幽门部。",
    glb: "/models/stomach.glb",
    closeupGlb: "/models/innerscene-stomach.glb",
    referenceLabel: "Innerscene 示意模型",
    thumb: "/anatomy/stomach/thumb.webp",
    organImg: "/anatomy/stomach/organ.webp",
    // 取自精细图谱中胃 FJ2564 的包围盒中心与最大边长（米）
    bodyPosition: [0.038, 1.176, 0.038],
    bodySize: 0.135,
  },
  skin: {
    id: "skin",
    nameZh: "皮肤组织",
    nameEn: "Skin",
    system: "体被系统",
    brief:
      "皮肤组织显微结构模型（含毛囊、汗腺等），人体最大的器官，构成保护屏障并参与感觉与体温调节。",
    glb: "/models/skin.glb",
    thumb: "/anatomy/skin/thumb.webp",
    organImg: "/anatomy/skin/organ.webp",
    bodyPosition: [0, 0.9, 0],
    bodySize: 1.78,
    isShell: true,
  },
  uterus: {
    id: "uterus",
    nameZh: "子宫",
    nameEn: "Uterus",
    system: "生殖系统",
    brief:
      "女性内生殖器官：子宫为梨形肌性器官，两侧经输卵管连接卵巢，受激素调控产生月经并孕育胎儿。",
    glb: "",
    closeupGlb: "/models/hra-uterus-female.glb",
    referenceLabel: "HuBMAP 女性子宫参考模型（不含附件）",
    thumb: "/cases/uterus-thumb.png",
    organImg: "/cases/uterus-thumb.png",
    bodyPosition: [0, 0.955, -0.01],
    bodySize: 0.16,
    procedural: true,
    femaleOnly: true,
  },
};

export const ORGAN_LIST: OrganInfo[] = Object.values(ORGANS);

/** 器官 → 默认手术体区（region 字段兜底） */
export const REGION_BY_ORGAN: Record<OrganId, string> = {
  brain: "颅脑",
  eyeball: "眼眶",
  heart: "胸腔",
  lungs: "胸腔",
  liver: "腹腔",
  pancreas: "腹腔",
  kidneys: "腹膜后",
  intestine: "腹腔",
  stomach: "腹腔",
  skin: "体表",
  uterus: "盆腔",
};

/** 规划 region 归一化：模型偶尔回填器官 ID 或留空时，用体区兜底 */
export function normalizeRegion(rawRegion: string, focusOrganRaw: string): string {
  const region = (rawRegion ?? "").trim();
  if (region && !(ORGAN_IDS as string[]).includes(region.toLowerCase())) {
    return region;
  }
  return REGION_BY_ORGAN[matchOrgan(focusOrganRaw)];
}

/** 按名称模糊匹配器官（供 AI 输出的 focusOrgan 容错映射） */
export function matchOrgan(raw: string): OrganId {
  const v = (raw ?? "").trim().toLowerCase();
  if ((ORGAN_IDS as string[]).includes(v)) return v as OrganId;
  const table: [RegExp, OrganId][] = [
    [/brain|脑|颅|cerebr/i, "brain"],
    [/eye|眼球|ocular/i, "eyeball"],
    [/heart|心|cardiac|冠脉|coronary/i, "heart"],
    [/lung|肺|呼吸|bronch|pulmon/i, "lungs"],
    [/liver|肝|hepat/i, "liver"],
    [/pancrea|胰/i, "pancreas"],
    [/kidney|肾|renal|尿/i, "kidneys"],
    [/uterus|子宫|卵巢|ovar|输卵管|阴道|宫颈|妇科/i, "uterus"],
    [/intestin|肠|digest|阑尾|appendix|colon|直肠/i, "intestine"],
    [/stomach|gastric|胃/i, "stomach"],
    [/skin|皮肤|体表|表面/i, "skin"],
  ];
  for (const [re, id] of table) if (re.test(v) || re.test(raw ?? "")) return id;
  return "skin";
}
