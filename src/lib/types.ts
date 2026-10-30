// ─── 领域模型 ────────────────────────────────────────────────────────────────

/** 可用 3D 器官模型（GLB 来自 thebuggeddev/anatomy；stomach 由 BodyParts3D 图谱网格转换；uterus 为程序化女性器官） */
export type OrganId =
  | "brain"
  | "eyeball"
  | "heart"
  | "lungs"
  | "liver"
  | "pancreas"
  | "kidneys"
  | "intestine"
  | "stomach"
  | "skin"
  | "uterus";

export const ORGAN_IDS: OrganId[] = [
  "brain",
  "eyeball",
  "heart",
  "lungs",
  "liver",
  "pancreas",
  "kidneys",
  "intestine",
  "stomach",
  "skin",
  "uterus",
];

export interface Patient {
  id: string;
  name: string;
  gender: string;
  age: number;
  /** 病历文本（主诉/现病史/既往史/检查/诊断） */
  medicalRecord: string;
  /** 手术初步方案 */
  preliminaryPlan: string;
  createdAt: string;
}

export interface SurgicalStep {
  index: number;
  name: string;
  detail: string;
  duration: string;
  risk: string;
  keyPoints: string[];
}

export interface PlanRisk {
  risk: string;
  mitigation: string;
}

/** AI 生成的结构化手术方案 */
export interface StructuredPlan {
  summary: string;
  diagnosis: string;
  procedureName: string;
  anesthesia: string;
  /** 手术体位 */
  position: string;
  /** 手术入路 */
  approach: string;
  instruments: string[];
  steps: SurgicalStep[];
  risks: PlanRisk[];
  postop: string[];
  /** 模拟聚焦的 3D 器官（须为 ORGAN_IDS 之一，由生成流程校验） */
  focusOrgan: string;
  /** 手术区域，如 腹腔 / 胸腔 / 颅脑 */
  region: string;
  simulationNotes: string;
}

export interface PlanVersion {
  id: string;
  planId: string;
  version: number;
  content: StructuredPlan;
  /** 修订说明（专家反馈修订时由 AI 生成） */
  changelog: string;
  source: "ai" | "expert_refine";
  /** 本版本引用的手术知识库条目标题 */
  knowledgeUsed: string[];
  knowledgeReferences?: KnowledgeReference[];
  createdAt: string;
}

export interface ExpertFeedback {
  id: string;
  planId: string;
  version: number;
  expertName: string;
  comment: string;
  createdAt: string;
}

export interface SurgicalPlan {
  id: string;
  patientId: string;
  title: string;
  patientName: string;
  diagnosis?: string;
  status: "draft" | "simulated" | "refined" | "finalized";
  currentVersion: number;
  archivedAt?: string | null;
  finalizedVersion?: number | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationStep {
  index: number;
  name: string;
  /** 模拟解说词 */
  narration: string;
  /** overview = 人体层面；organ = 器官层面 */
  view: "overview" | "organ";
  durationSec: number;
  /** 本步骤使用的手术器械（标准器械库名称） */
  instruments?: string[];
  /** 动作类型，驱动 3D 器械动画：position|trocar|explore|cut|coagulate|dissect|resect|clamp|suture|irrigate|extract|none */
  action?: string;
}

export interface SimulationRun {
  id: string;
  planId: string;
  version: number;
  focusOrgan: string;
  region: string;
  steps: SimulationStep[];
  createdAt: string;
}

export interface PlanDetail {
  plan: SurgicalPlan;
  patient: Patient;
  versions: PlanVersion[];
  feedbacks: ExpertFeedback[];
  simulations: SimulationRun[];
}

// ─── 知识库 ──────────────────────────────────────────────────────────────────

export interface KnowledgeReference {
  id: string;
  title: string;
  content: string;
  sourceName: string;
  sourceUrl: string;
  sourceVersion: string;
  reviewedBy: string;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  /** procedure | instrument | guideline | anatomy */
  category: string;
  content: string;
  tags: string[];
  sourceName?: string;
  sourceUrl?: string;
  sourceVersion?: string;
  reviewStatus?: "unreviewed" | "approved";
  reviewedBy?: string;
  reviewedAt?: string | null;
  updatedAt?: string;
  createdAt: string;
}

// ─── 对话 ────────────────────────────────────────────────────────────────────

export type ChatMode = "learning" | "guidance";

export interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatContext {
  planId?: string;
  planVersion?: number;
  /** 学习模式：当前聚焦的器官 */
  organId?: string;
  organName?: string;
  /** 指导模式：当前病例与方案摘要 */
  planTitle?: string;
  planSummary?: string;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  organId?: string;
  createdAt: string;
}
