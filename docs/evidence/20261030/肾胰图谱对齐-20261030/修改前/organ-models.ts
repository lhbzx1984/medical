// 3D 器官模型注册表。
// GLB 资产来自 thebuggeddev/anatomy（Meshopt 压缩），缩略图来自其器官图集。
// 例外：stomach.glb 由 scripts/extract-stomach-glb.mjs 从 BodyParts3D 精细图谱（FJ2564）转换，缩略图为其实际渲染。
// bodyPosition / bodySize 用于「人体概览」场景中的解剖学摆放：
//   坐标系为 Y 轴向上、单位米、标准站立人体身高约 1.75m，面朝 +Z；+X 为患者左侧（与精细图谱一致）。
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
  thumb: string;
  organImg: string;
  /** 概览场景中的中心位置 */
  bodyPosition: [number, number, number];
  /** 概览场景中的目标最大尺寸（米） */
  bodySize: number;
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
    thumb: "/anatomy/brain/thumb.webp",
    organImg: "/anatomy/brain/organ.webp",
    bodyPosition: [0, 1.585, -0.01],
    bodySize: 0.2,
  },
  eyeball: {
    id: "eyeball",
    nameZh: "眼球",
    nameEn: "Eyeball",
    system: "感觉器官",
    brief: "视觉感受器，光线经角膜、晶状体折射后在视网膜成像，转换为神经冲动。",
    glb: "/models/eyeball.glb",
    thumb: "/anatomy/eyeball/thumb.webp",
    organImg: "/anatomy/eyeball/organ.webp",
    bodyPosition: [0.034, 1.652, 0.06],
    bodySize: 0.05,
  },
  heart: {
    id: "heart",
    nameZh: "心脏",
    nameEn: "Heart",
    system: "循环系统",
    brief: "四腔肌性泵，驱动肺循环与体循环；瓣膜保证血液单向流动。",
    glb: "/models/heart.glb",
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
    thumb: "/anatomy/lungs/thumb.webp",
    organImg: "/anatomy/lungs/organ.webp",
    bodyPosition: [0, 1.295, 0.0],
    bodySize: 0.34,
  },
  liver: {
    id: "liver",
    nameZh: "肝",
    nameEn: "Liver",
    system: "消化系统",
    brief: "最大实质器官，位于右膈下；参与代谢、解毒、胆汁生成与血浆蛋白合成。",
    glb: "/models/liver.glb",
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
    thumb: "/anatomy/pancreas/thumb.webp",
    organImg: "/anatomy/pancreas/organ.webp",
    bodyPosition: [0.0, 1.105, -0.005],
    bodySize: 0.2,
  },
  kidneys: {
    id: "kidneys",
    nameZh: "肾",
    nameEn: "Kidneys",
    system: "泌尿系统",
    brief: "成对腹膜后器官，过滤血液、调节水盐与酸碱平衡，生成尿液经输尿管排出。",
    glb: "/models/kidneys.glb",
    thumb: "/anatomy/kidneys/thumb.webp",
    organImg: "/anatomy/kidneys/organ.webp",
    bodyPosition: [0, 1.14, -0.048],
    bodySize: 0.24,
  },
  intestine: {
    id: "intestine",
    nameZh: "肠",
    nameEn: "Intestines",
    system: "消化系统",
    brief: "小肠与大肠构成消化管下段，负责吸收营养与水分、成形并排出粪便。",
    glb: "/models/intestine.glb",
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
