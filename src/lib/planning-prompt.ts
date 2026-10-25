// 手术规划智能体的提示词工程。
// 所有面向 Agnes(agnes-2.5-flash) 的规划类 system prompt 集中在此维护。
import type { ExpertFeedback, PlanVersion, Patient, SimulationStep } from "./types";
import { ORGAN_IDS } from "./types";

const ORGAN_ENUM = ORGAN_IDS.join(" | ");

export const PLAN_JSON_SCHEMA_DESC = `输出一个严格合法的 JSON 对象（不要包含注释、不要有多余文字），结构如下：
{
  "summary": "方案总体摘要，2-3 句",
  "diagnosis": "主要诊断与术前评估结论",
  "procedureName": "拟施手术名称（标准术式命名）",
  "anesthesia": "麻醉方式与注意事项",
  "position": "手术体位",
  "approach": "手术入路",
  "region": "手术所在体区，必须是中文体区名称（腹腔、胸腔、颅脑、盆腔、腹膜后、颈部、体表之一），不要填英文或器官编号",
  "instruments": ["关键器械/耗材清单"],
  "steps": [
    { "index": 1, "name": "步骤名", "detail": "操作要点，1-3 句", "duration": "预计时长", "risk": "本步骤主要风险", "keyPoints": ["关键注意事项"] }
  ],
  "risks": [ { "risk": "风险描述", "mitigation": "预防与应对措施" } ],
  "postop": ["术后处理要点"],
  "focusOrgan": "${ORGAN_ENUM} 之一（用于 3D 模拟聚焦，选手术涉及的核心器官；若都不贴切选 skin）",
  "simulationNotes": "3D 模拟时需要特别展示/解说的解剖要点"
}`;

export function planGenerateSystem(): string {
  return [
    "你是一名拥有 30 年经验的资深外科主任医师，同时承担术前多学科讨论（MDT）的组织工作。",
    "你的任务：依据患者病历、初步手术方案和检索到的手术知识库条目，产出一份结构化的术前手术规划。",
    "要求：步骤完整可执行、风险识别充分、符合临床规范与无菌原则；语言为简体中文，专业术语首次出现附英文。",
    PLAN_JSON_SCHEMA_DESC,
  ].join("\n");
}

export function planGenerateUser(p: Patient, knowledge: { title: string; content: string }[]): string {
  return [
    "【患者病历】",
    `姓名: ${p.name}；性别: ${p.gender || "未填写"}；年龄: ${p.age || "未填写"}`,
    p.medicalRecord,
    "",
    "【初步手术方案】",
    p.preliminaryPlan || "（未提供，请根据病历推断并给出建议术式）",
    "",
    knowledge.length
      ? "【手术知识库检索结果】\n" + knowledge.map((k) => `◆ ${k.title}\n${k.content}`).join("\n")
      : "【手术知识库检索结果】（无相关条目）",
    "",
    "请生成完整的术前手术规划 JSON。",
  ].join("\n");
}

export function planRefineSystem(): string {
  return [
    "你是一名资深外科主任医师。专家（上级医师/MDT 成员）对当前版本的手术规划提出了反馈意见。",
    "你的任务：在保持整体结构的前提下修订手术规划，逐条回应专家意见，使方案更安全、更完善。",
    "同时生成一段 changelog，说明本版本相对上一版本做了哪些修改（分条列出）。",
    PLAN_JSON_SCHEMA_DESC,
    '另外在 JSON 顶层增加一个 "changelog": "字符串" 字段，用 3-6 条要点概括修订内容。',
  ].join("\n");
}

export function planRefineUser(
  p: Patient,
  version: PlanVersion,
  feedback: ExpertFeedback,
  knowledge: { title: string; content: string }[]
): string {
  return [
    "【患者病历】",
    `姓名: ${p.name}；性别: ${p.gender || "未填写"}；年龄: ${p.age || "未填写"}`,
    p.medicalRecord,
    "",
    `【当前手术规划（v${version.version}）JSON】`,
    JSON.stringify(version.content, null, 2),
    "",
    `【专家反馈（${feedback.expertName || "专家"}，针对 v${feedback.version}）】`,
    feedback.comment,
    "",
    knowledge.length
      ? "【手术知识库检索结果】\n" + knowledge.map((k) => `◆ ${k.title}\n${k.content}`).join("\n")
      : "【手术知识库检索结果】（无相关条目）",
    "",
    "请输出修订后的完整手术规划 JSON（含 changelog 字段）。",
  ].join("\n");
}

export const SIMULATION_SYSTEM = `你是手术模拟编排器。输入一份结构化手术规划，请生成"从人体到器官"的 3D 模拟播放脚本：
1. 开场步骤站在"人体层面"（view="overview"）介绍体区、切口位置与体位；
2. 随后进入"器官层面"（view="organ"）按手术步骤逐一演示，每步 narration 用 2-3 句解说该步骤在该器官上的操作要点与风险；
3. 最后一步回到总结（view 可为 overview 或 organ），说明关键风险与术后观察要点。
每步必须给出该步骤实际使用的手术器械（instruments，从标准器械库选 0-3 件：手术刀、电刀、止血钳、手术剪、持针器、穿刺器、腹腔镜、冲洗吸引器、标本袋、纱布），
以及该步骤的核心动作类型（action，从以下选一：position=体位摆放、trocar=建立通道、explore=探查、cut=切开离断、coagulate=电凝止血、dissect=分离、resect=切除剪断、clamp=钳夹结扎、suture=缝合、irrigate=冲洗吸引、extract=标本取出、none=无操作）。
严格输出 JSON：
{ "steps": [ { "index": 1, "name": "步骤名", "narration": "解说词", "view": "overview" | "organ", "durationSec": 8, "instruments": ["穿刺器"], "action": "trocar" } ] }
durationSec 取 8-14 之间的整数；步骤数量 5-9 个。`;

export function simulationUser(planJson: unknown): string {
  return ["【手术规划 JSON】", JSON.stringify(planJson), "", "请生成模拟播放脚本 JSON。"].join("\n");
}

/** 由步骤名称推断器械与动作（LLM 未返回时的兜底规则） */
export function inferInstruments(name: string): { instruments: string[]; action: string } {
  const n = name ?? "";
  const has = (...ks: string[]) => ks.some((k) => n.includes(k));
  if (has("体位", "摆位", "麻醉诱导", "消毒", "铺巾")) return { instruments: [], action: "position" };
  if (has("trocar", "套管", "穿刺", "气腹", "通道")) return { instruments: ["穿刺器"], action: "trocar" };
  if (has("探查", "定位", "辨认", "游离")) return { instruments: ["腹腔镜"], action: "explore" };
  if (has("止血", "电凝")) return { instruments: ["电刀", "止血钳"], action: "coagulate" };
  if (has("缝合", "吻合")) return { instruments: ["持针器"], action: "suture" };
  if (has("冲洗", "吸引")) return { instruments: ["冲洗吸引器"], action: "irrigate" };
  if (has("标本", "取出", "装袋")) return { instruments: ["标本袋"], action: "extract" };
  if (has("剪断", "切除", "离断")) return { instruments: ["手术剪", "止血钳"], action: "resect" };
  if (has("切开", "划开", "切口")) return { instruments: ["手术刀"], action: "cut" };
  if (has("钳夹", "结扎", "夹闭")) return { instruments: ["止血钳"], action: "clamp" };
  if (has("分离")) return { instruments: ["手术剪"], action: "dissect" };
  return { instruments: ["止血钳"], action: "explore" };
}

const KNOWN_ACTIONS = [
  "position", "trocar", "explore", "cut", "coagulate", "dissect",
  "resect", "clamp", "suture", "irrigate", "extract", "none",
];

/** 归一化 LLM 生成的模拟步骤：补齐器械与动作类型（缺失时按步骤名推断） */
export function normalizeSimSteps(rawSteps: unknown): SimulationStep[] {
  const arr = Array.isArray(rawSteps) ? (rawSteps as Record<string, unknown>[]).slice(0, 12) : [];
  return arr.map((s, i) => {
    const inf = inferInstruments(String(s?.name ?? ""));
    const actionRaw = String(s?.action ?? "");
    const action = (KNOWN_ACTIONS as string[]).includes(actionRaw) ? actionRaw : inf.action;
    const instruments = Array.isArray(s?.instruments) && s.instruments.length
      ? (s.instruments as unknown[]).slice(0, 3).map(String)
      : inf.instruments;
    return {
      index: i + 1,
      name: String(s?.name ?? `阶段${i + 1}`),
      narration: String(s?.narration ?? ""),
      view: s?.view === "overview" ? ("overview" as const) : ("organ" as const),
      durationSec: Math.min(20, Math.max(6, Number(s?.durationSec) || 10)),
      instruments,
      action,
    };
  });
}

/** LLM 不可用/失败时的降级模拟脚本：直接由手术步骤合成。 */
export function fallbackSimulationSteps(planJson: { procedureName?: string; region?: string; steps?: { name: string; detail: string; duration?: string }[]; simulationNotes?: string }): { steps: { index: number; name: string; narration: string; view: "overview" | "organ"; durationSec: number; instruments: string[]; action: string }[] } {
  const steps: { index: number; name: string; narration: string; view: "overview" | "organ"; durationSec: number; instruments: string[]; action: string }[] = [
    {
      index: 1,
      name: "体区定位",
      view: "overview",
      durationSec: 10,
      narration: `手术区域：${planJson.region ?? "体表"}。请观察人体上的手术部位与体位摆放；切口设计避开重要解剖结构。`,
      instruments: [],
      action: "position",
    },
  ];
  (planJson.steps ?? []).slice(0, 7).forEach((s, i) => {
    const inf = inferInstruments(s.name);
    steps.push({
      index: i + 2,
      name: s.name,
      view: "organ",
      durationSec: 11,
      narration: s.detail || s.name,
      instruments: inf.instruments,
      action: inf.action,
    });
  });
  if (planJson.simulationNotes) {
    steps.push({
      index: steps.length + 1,
      name: "要点回顾",
      view: "organ",
      durationSec: 9,
      narration: planJson.simulationNotes,
      instruments: [],
      action: "none",
    });
  }
  return { steps };
}
