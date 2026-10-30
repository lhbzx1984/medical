// Supabase 持久化存储（表结构见 supabase/schema.sql）。
// 每个请求使用用户会话访问数据库，由 RLS 限制数据范围。
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { DataStore, id, NewPatient, now } from "./base";

type Row = Record<string, unknown>;

export class CaseNotFoundError extends Error {
  constructor() { super("未找到该病例"); }
}

export class RevisionConflictError extends Error {
  constructor() { super("规划已被更新，请刷新后重试"); }
}

export class SupabaseStore implements DataStore {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.sb = client;
  }

  private tbl(name: string) {
    return this.sb.from(name);
  }

  // ── 病人 ──
  async createPatient(input: NewPatient): Promise<Patient> {
    const row = {
      id: id(),
      name: input.name,
      gender: input.gender ?? "",
      age: input.age ?? 0,
      medical_record: input.medicalRecord ?? "",
      preliminary_plan: input.preliminaryPlan ?? "",
      created_at: now(),
    };
    const { error } = await this.tbl("patients").insert(row);
    if (error) throw new Error(`Supabase 写入 patients 失败: ${error.message}`);
    return this.rowToPatient(row);
  }

  private rowToPatient(r: Row): Patient {
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      gender: String(r.gender ?? ""),
      age: Number(r.age ?? 0),
      medicalRecord: String(r.medical_record ?? ""),
      preliminaryPlan: String(r.preliminary_plan ?? ""),
      createdAt: String(r.created_at ?? now()),
    };
  }

  async getPatient(pid: string): Promise<Patient | null> {
    const { data, error } = await this.tbl("patients").select("*").eq("id", pid).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.rowToPatient(data) : null;
  }

  async listPatients(): Promise<Patient[]> {
    const { data, error } = await this.tbl("patients").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.rowToPatient(r));
  }

  // ── 手术方案 ──
  async createPlan(input: { patientId: string; title?: string }): Promise<SurgicalPlan> {
    const patient = await this.getPatient(input.patientId);
    const row = {
      id: id(),
      patient_id: input.patientId,
      title: input.title || `${patient?.name ?? "病例"}·手术规划`,
      patient_name: patient?.name ?? "",
      status: "draft",
      current_version: 0,
      created_at: now(),
      updated_at: now(),
    };
    const { error } = await this.tbl("surgical_plans").insert(row);
    if (error) throw new Error(`Supabase 写入 surgical_plans 失败: ${error.message}`);
    return {
      id: String(row.id),
      patientId: row.patient_id,
      title: row.title,
      patientName: row.patient_name,
      status: "draft",
      currentVersion: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToPlan(r: Row): SurgicalPlan {
    return {
      id: String(r.id),
      patientId: String(r.patient_id),
      title: String(r.title ?? ""),
      patientName: String(r.patient_name ?? ""),
      status: (r.status as SurgicalPlan["status"]) ?? "draft",
      currentVersion: Number(r.current_version ?? 0),
      archivedAt: r.archived_at ? String(r.archived_at) : null,
      finalizedVersion: r.finalized_version == null ? null : Number(r.finalized_version),
      finalizedAt: r.finalized_at ? String(r.finalized_at) : null,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
    };
  }

  async listPlans(): Promise<SurgicalPlan[]> {
    const { data, error } = await this.tbl("surgical_plans")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.rowToPlan(r));
  }

  async getPlanDetail(planId: string): Promise<PlanDetail | null> {
    const { data: planRow, error } = await this.tbl("surgical_plans").select("*").eq("id", planId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!planRow) return null;
    const patient = await this.getPatient(String(planRow.patient_id));
    if (!patient) return null;
    const results = await Promise.all([
      this.tbl("plan_versions").select("*").eq("plan_id", planId).order("version"),
      this.tbl("plan_feedback").select("*").eq("plan_id", planId).order("created_at"),
      this.tbl("simulations").select("*").eq("plan_id", planId).order("version"),
    ]);
    for (const result of results) {
      if (result.error) throw new Error(`Supabase 查询规划详情失败: ${result.error.message}`);
    }
    const [versions, feedbacks, simulations] = results.map((result) => result.data ?? []);
    return {
      plan: this.rowToPlan(planRow),
      patient,
      versions: (versions as Row[]).map((r) => ({
        id: String(r.id),
        planId: String(r.plan_id),
        version: Number(r.version),
        content: r.content as PlanVersion["content"],
        changelog: String(r.changelog ?? ""),
        source: (r.source as PlanVersion["source"]) ?? "ai",
        knowledgeUsed: (r.knowledge_used as string[]) ?? [],
        createdAt: String(r.created_at ?? ""),
      })),
      feedbacks: (feedbacks as Row[]).map((r) => ({
        id: String(r.id),
        planId: String(r.plan_id),
        version: Number(r.version),
        expertName: String(r.expert_name ?? ""),
        comment: String(r.comment ?? ""),
        createdAt: String(r.created_at ?? ""),
      })),
      simulations: (simulations as Row[]).map((r) => ({
        id: String(r.id),
        planId: String(r.plan_id),
        version: Number(r.version),
        focusOrgan: String(r.focus_organ ?? "skin"),
        region: String(r.region ?? ""),
        steps: (r.steps as SimulationRun["steps"]) ?? [],
        createdAt: String(r.created_at ?? ""),
      })),
    };
  }

  async setFinalized(planId: string, expectedUpdatedAt: string, version: number, finalized: boolean): Promise<void> {
    const { error } = await this.sb.rpc("medplan_set_finalized", {
      p_plan_id: planId, p_expected_updated_at: expectedUpdatedAt, p_version: version, p_finalized: finalized,
    });
    if (error?.code === "40001") throw new RevisionConflictError();
    if (error?.code === "P0002") throw new CaseNotFoundError();
    if (error) throw new Error(`更新定稿状态失败: ${error.message}`);
  }

  async setArchived(planId: string, expectedUpdatedAt: string, archived: boolean): Promise<void> {
    const { error } = await this.sb.rpc("medplan_set_archived", {
      p_plan_id: planId, p_expected_updated_at: expectedUpdatedAt, p_archived: archived,
    });
    if (error?.code === "40001") throw new RevisionConflictError();
    if (error?.code === "P0002") throw new CaseNotFoundError();
    if (error) throw new Error(`更新归档状态失败: ${error.message}`);
  }

  async updateCase(planId: string, expectedUpdatedAt: string, patient: NewPatient): Promise<void> {
    const { error } = await this.sb.rpc("medplan_update_case", {
      p_plan_id: planId, p_expected_updated_at: expectedUpdatedAt, p_patient: patient,
    });
    if (error?.code === "40001" || error?.code === "P0001") throw new RevisionConflictError();
    if (error?.code === "P0002") throw new CaseNotFoundError();
    if (error) throw new Error(`保存病例失败: ${error.message}`);
  }

  async consumeAiQuota(operation: "chat" | "image" | "plan"): Promise<boolean> {
    const { data, error } = await this.sb.rpc("medplan_consume_ai_quota", { p_operation: operation });
    if (error) throw new Error(`AI 配额检查失败: ${error.message}`);
    return data === true;
  }

  async saveRevision(input: {
    expectedVersion: number;
    expectedUpdatedAt: string;
    version: PlanVersion;
    simulation: SimulationRun;
    feedback?: ExpertFeedback;
  }): Promise<void> {
    const { error } = await this.sb.rpc("medplan_save_revision", {
      p_plan_id: input.version.planId,
      p_expected_version: input.expectedVersion,
      p_version: { ...input.version, expectedUpdatedAt: input.expectedUpdatedAt },
      p_simulation: input.simulation,
      p_feedback: input.feedback ?? null,
    });
    if (error?.code === "40001" || error?.code === "23505" || error?.code === "P0001") throw new RevisionConflictError();
    if (error) throw new Error(`保存规划版本失败: ${error.message}`);
  }

  async addPlanVersion(v: Omit<PlanVersion, "id" | "createdAt">): Promise<PlanVersion> {
    const row = {
      id: id(),
      plan_id: v.planId,
      version: v.version,
      content: v.content,
      changelog: v.changelog,
      source: v.source,
      knowledge_used: v.knowledgeUsed,
      created_at: now(),
    };
    const { error } = await this.tbl("plan_versions").insert(row);
    if (error) throw new Error(`Supabase 写入 plan_versions 失败: ${error.message}`);
    const status = v.source === "expert_refine" ? "refined" : "simulated";
    await this.updatePlanStatus(v.planId, { currentVersion: v.version, status });
    return {
      id: row.id,
      planId: v.planId,
      version: v.version,
      content: v.content,
      changelog: v.changelog,
      source: v.source,
      knowledgeUsed: v.knowledgeUsed,
      createdAt: row.created_at,
    };
  }

  async addFeedback(f: Omit<ExpertFeedback, "id" | "createdAt">): Promise<ExpertFeedback> {
    const row = {
      id: id(),
      plan_id: f.planId,
      version: f.version,
      expert_name: f.expertName,
      comment: f.comment,
      created_at: now(),
    };
    const { error } = await this.tbl("plan_feedback").insert(row);
    if (error) throw new Error(`Supabase 写入 plan_feedback 失败: ${error.message}`);
    return { ...f, id: row.id, createdAt: row.created_at };
  }

  async addSimulation(s: Omit<SimulationRun, "id" | "createdAt">): Promise<SimulationRun> {
    const row = {
      id: id(),
      plan_id: s.planId,
      version: s.version,
      focus_organ: s.focusOrgan,
      region: s.region,
      steps: s.steps,
      created_at: now(),
    };
    const { error } = await this.tbl("simulations").insert(row);
    if (error) throw new Error(`Supabase 写入 simulations 失败: ${error.message}`);
    return { ...s, id: row.id, createdAt: row.created_at };
  }

  async updatePlanStatus(
    planId: string,
    patch: Partial<Pick<SurgicalPlan, "status" | "currentVersion" | "title">>
  ): Promise<void> {
    const upd: Row = { updated_at: now() };
    if (patch.status) upd.status = patch.status;
    if (patch.currentVersion !== undefined) upd.current_version = patch.currentVersion;
    if (patch.title) upd.title = patch.title;
    const { error } = await this.tbl("surgical_plans").update(upd).eq("id", planId);
    if (error) throw new Error(`Supabase 更新 surgical_plans 失败: ${error.message}`);
  }

  // ── 知识库 ──
  async listKnowledge(q?: string): Promise<KnowledgeEntry[]> {
    let query = this.tbl("knowledge_entries").select("*").order("created_at", { ascending: true });
    if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Row) => ({
      id: String(r.id),
      title: String(r.title),
      category: String(r.category ?? "guideline"),
      content: String(r.content ?? ""),
      tags: (r.tags as string[]) ?? [],
      createdAt: String(r.created_at ?? ""),
    }));
  }

  async addKnowledge(e: Omit<KnowledgeEntry, "id" | "createdAt">): Promise<KnowledgeEntry> {
    const row = {
      id: id(),
      title: e.title,
      category: e.category,
      content: e.content,
      tags: e.tags,
      created_at: now(),
    };
    const { error } = await this.tbl("knowledge_entries").insert(row);
    if (error) throw new Error(`Supabase 写入 knowledge_entries 失败: ${error.message}`);
    return { ...e, id: row.id, createdAt: row.created_at };
  }

  // ── 对话 ──
  async ensureChatSession(sessionId: string, mode: ChatMode, title: string): Promise<void> {
    const { error } = await this.tbl("chat_sessions").upsert({
      id: sessionId,
      mode,
      title,
      created_at: now(),
    });
    if (error) throw new Error(`Supabase 写入 chat_sessions 失败: ${error.message}`);
  }

  async addChatMessages(
    sessionId: string,
    msgs: { role: "user" | "assistant"; content: string }[]
  ): Promise<void> {
    if (!msgs.length) return;
    const rows = msgs.map((m) => ({
      id: id(),
      session_id: sessionId,
      role: m.role,
      content: m.content,
      created_at: now(),
    }));
    const { error } = await this.tbl("chat_messages").insert(rows);
    if (error) throw new Error(`Supabase 写入 chat_messages 失败: ${error.message}`);
  }

  async addGeneratedImage(g: Omit<GeneratedImage, "id" | "createdAt">): Promise<GeneratedImage> {
    const row = {
      id: id(),
      prompt: g.prompt,
      url: g.url,
      organ_id: g.organId ?? null,
      created_at: now(),
    };
    const { error } = await this.tbl("generated_images").insert(row);
    if (error) throw new Error(`Supabase 写入 generated_images 失败: ${error.message}`);
    return { ...g, id: row.id, createdAt: row.created_at };
  }
}
