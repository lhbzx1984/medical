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
  SimulationStep,
  StructuredPlan,
  SurgicalPlan,
} from "../types";

export interface NewPatient {
  name: string;
  gender?: string;
  age?: number;
  medicalRecord?: string;
  preliminaryPlan?: string;
}

export interface NewCase extends NewPatient {
  ownerId: string;
  title?: string;
}

export interface PlanCommitInput {
  planId: string;
  ownerId: string;
  expectedVersion: number;
  content: StructuredPlan;
  changelog: string;
  source: "ai" | "expert_refine";
  knowledgeUsed: string[];
  simulation: { focusOrgan: string; region: string; steps: SimulationStep[] };
  feedback?: { expertName: string; comment: string };
}

export interface PlanCommitResult {
  version: PlanVersion;
  simulation: SimulationRun;
  feedback?: ExpertFeedback;
}

export class StoreConflictError extends Error {
  constructor(message = "方案已被更新，请重新加载后再试") {
    super(message);
    this.name = "StoreConflictError";
  }
}

export class StoreAccessError extends Error {
  constructor(message = "无权访问该记录") {
    super(message);
    this.name = "StoreAccessError";
  }
}

export interface DataStore {
  readonly kind: "supabase" | "memory";

  createCase(input: NewCase): Promise<{ patient: Patient; plan: SurgicalPlan }>;
  listPlans(ownerId: string): Promise<SurgicalPlan[]>;
  getPlanDetail(planId: string, ownerId: string): Promise<PlanDetail | null>;
  commitPlan(input: PlanCommitInput): Promise<PlanCommitResult>;
  consumeRateLimit(ownerId: string, action: string, limit: number, windowSeconds: number): Promise<boolean>;

  // 手术知识库
  listKnowledge(q?: string): Promise<KnowledgeEntry[]>;
  addKnowledge(e: Omit<KnowledgeEntry, "id" | "createdAt">): Promise<KnowledgeEntry>;

  // 对话
  ensureChatSession(sessionId: string, mode: ChatMode, title: string, ownerId: string): Promise<void>;
  addChatMessages(
    sessionId: string,
    msgs: { role: "user" | "assistant"; content: string }[],
    ownerId: string
  ): Promise<void>;

  // AI 生成图像记录
  addGeneratedImage(g: Omit<GeneratedImage, "id" | "createdAt">): Promise<GeneratedImage>;
}

export function id(): string {
  return globalThis.crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
