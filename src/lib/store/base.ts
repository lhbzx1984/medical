// 数据访问层抽象。
// 生产环境使用 SupabaseStore（配置环境变量后自动启用）；
// 未配置 Supabase 时自动降级为 MemoryStore（内置演示存储，重启即清空），保证开箱即用。
import type {
  ChatMode,
  ExpertFeedback,
  GeneratedImage,
  KnowledgeEntry,
  PlanDetail,
  PlanVersion,
  Patient,
  SimulationRun,
  SurgicalPlan,
} from "../types";

export interface NewPatient {
  name: string;
  gender?: string;
  age?: number;
  medicalRecord?: string;
  preliminaryPlan?: string;
}

export interface DataStore {
  readonly kind: "supabase" | "memory";

  // 病人
  createPatient(input: NewPatient): Promise<Patient>;
  getPatient(id: string): Promise<Patient | null>;
  listPatients(): Promise<Patient[]>;

  // 手术方案
  createPlan(input: { patientId: string; title?: string }): Promise<SurgicalPlan>;
  listPlans(): Promise<SurgicalPlan[]>;
  getPlanDetail(planId: string): Promise<PlanDetail | null>;
  addPlanVersion(v: Omit<PlanVersion, "id" | "createdAt">): Promise<PlanVersion>;
  addFeedback(f: Omit<ExpertFeedback, "id" | "createdAt">): Promise<ExpertFeedback>;
  addSimulation(s: Omit<SimulationRun, "id" | "createdAt">): Promise<SimulationRun>;
  updatePlanStatus(
    planId: string,
    patch: Partial<Pick<SurgicalPlan, "status" | "currentVersion" | "title">>
  ): Promise<void>;

  // 手术知识库
  listKnowledge(q?: string): Promise<KnowledgeEntry[]>;
  addKnowledge(e: Omit<KnowledgeEntry, "id" | "createdAt">): Promise<KnowledgeEntry>;

  // 对话
  ensureChatSession(sessionId: string, mode: ChatMode, title: string): Promise<void>;
  addChatMessages(
    sessionId: string,
    msgs: { role: "user" | "assistant"; content: string }[]
  ): Promise<void>;

  // AI 生成图像记录
  addGeneratedImage(g: Omit<GeneratedImage, "id" | "createdAt">): Promise<GeneratedImage>;
}

export function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function now(): string {
  return new Date().toISOString();
}
