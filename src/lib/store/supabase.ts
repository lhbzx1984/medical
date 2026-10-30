// Supabase 持久化存储（表结构见 supabase/schema.sql）。
// 服务端使用 SERVICE_ROLE_KEY 直连，绕过 RLS；所有访问都经过 Next.js API Route，
// Key 不会下发到浏览器。
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  ChatMode,
  GeneratedImage,
  KnowledgeEntry,
  PlanDetail,
  PlanVersion,
  Patient,
  SimulationRun,
  SurgicalPlan,
} from "../types";
import { DataStore, id, NewCase, now, PlanCommitInput, PlanCommitResult, StoreAccessError, StoreConflictError } from "./base";

type Row = Record<string, unknown>;

export class SupabaseStore implements DataStore {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  private tbl(name: string) {
    return this.sb.from(name);
  }

  async createCase(input: NewCase): Promise<{ patient: Patient; plan: SurgicalPlan }> {
    if (!input.ownerId) throw new StoreAccessError();
    const { data, error } = await this.sb.rpc("create_case", {
      p_owner_id: input.ownerId,
      p_patient: {
      name: input.name,
      gender: input.gender ?? "",
      age: input.age ?? 0,
      medical_record: input.medicalRecord ?? "",
      preliminary_plan: input.preliminaryPlan ?? "",
      },
      p_title: input.title ?? null,
    });
    if (error) throw new Error(`Supabase 创建病例失败: ${error.message}`);
    if (!data?.patient || !data?.plan) throw new Error("Supabase 创建病例未返回完整记录");
    return { patient: this.rowToPatient(data.patient), plan: this.rowToPlan(data.plan) };
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

  private async getPatient(pid: string): Promise<Patient | null> {
    const { data, error } = await this.tbl("patients").select("*").eq("id", pid).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.rowToPatient(data) : null;
  }

  private rowToPlan(r: Row): SurgicalPlan {
    return {
      id: String(r.id),
      patientId: String(r.patient_id),
      ownerId: String(r.owner_id ?? ""),
      title: String(r.title ?? ""),
      patientName: String(r.patient_name ?? ""),
      status: (r.status as SurgicalPlan["status"]) ?? "draft",
      currentVersion: Number(r.current_version ?? 0),
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
    };
  }

  async listPlans(ownerId: string): Promise<SurgicalPlan[]> {
    if (!ownerId) throw new StoreAccessError();
    const { data, error } = await this.tbl("surgical_plans")
      .select("*")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.rowToPlan(r));
  }

  async getPlanDetail(planId: string, ownerId: string): Promise<PlanDetail | null> {
    if (!ownerId) throw new StoreAccessError();
    const { data: planRow, error } = await this.tbl("surgical_plans").select("*").eq("id", planId).eq("owner_id", ownerId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!planRow) return null;
    const patient = await this.getPatient(String(planRow.patient_id));
    if (!patient) return null;
    const [versions, feedbacks, simulations] = await Promise.all([
      this.tbl("plan_versions").select("*").eq("plan_id", planId).order("version"),
      this.tbl("plan_feedback").select("*").eq("plan_id", planId).order("created_at"),
      this.tbl("simulations").select("*").eq("plan_id", planId).order("version"),
    ]);
    for (const [name, result] of [["plan_versions", versions], ["plan_feedback", feedbacks], ["simulations", simulations]] as const) {
      if (result.error) throw new Error(`Supabase 查询 ${name} 失败: ${result.error.message}`);
    }
    return {
      plan: this.rowToPlan(planRow),
      patient,
      versions: ((versions.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        planId: String(r.plan_id),
        version: Number(r.version),
        content: r.content as PlanVersion["content"],
        changelog: String(r.changelog ?? ""),
        source: (r.source as PlanVersion["source"]) ?? "ai",
        knowledgeUsed: (r.knowledge_used as string[]) ?? [],
        createdAt: String(r.created_at ?? ""),
      })),
      feedbacks: ((feedbacks.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        planId: String(r.plan_id),
        version: Number(r.version),
        expertName: String(r.expert_name ?? ""),
        comment: String(r.comment ?? ""),
        createdAt: String(r.created_at ?? ""),
      })),
      simulations: ((simulations.data ?? []) as Row[]).map((r) => ({
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

  async commitPlan(input: PlanCommitInput): Promise<PlanCommitResult> {
    if (!input.ownerId) throw new StoreAccessError();
    const { data, error } = await this.sb.rpc("commit_plan", {
      p_plan_id: input.planId,
      p_owner_id: input.ownerId,
      p_expected_version: input.expectedVersion,
      p_content: input.content,
      p_changelog: input.changelog,
      p_source: input.source,
      p_knowledge_used: input.knowledgeUsed,
      p_simulation: input.simulation,
      p_feedback: input.feedback ?? null,
    });
    if (error?.code === "40001" || error?.code === "23505") throw new StoreConflictError();
    if (error?.code === "42501") throw new StoreAccessError();
    if (error) throw new Error(`Supabase 保存方案失败: ${error.message}`);
    if (!data?.version || !data?.simulation) throw new Error("Supabase 保存方案未返回完整记录");
    const v = data.version, s = data.simulation, f = data.feedback;
    return {
      version: {id: v.id, planId: v.plan_id, version: v.version, content: v.content,
        changelog: v.changelog, source: v.source, knowledgeUsed: v.knowledge_used, createdAt: v.created_at},
      simulation: {id: s.id, planId: s.plan_id, version: s.version, focusOrgan: s.focus_organ,
        region: s.region, steps: s.steps, createdAt: s.created_at},
      ...(f ? {feedback: {id: f.id, planId: f.plan_id, version: f.version,
        expertName: f.expert_name, comment: f.comment, createdAt: f.created_at}} : {}),
    };
  }

  async consumeRateLimit(ownerId: string, action: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!ownerId) throw new StoreAccessError();
    const {data, error} = await this.sb.rpc("consume_rate_limit", {
      p_owner_id: ownerId, p_action: action, p_limit: limit, p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(`Supabase 限流检查失败: ${error.message}`);
    if (typeof data !== "boolean") throw new Error("Supabase 限流检查未返回有效结果");
    return data;
  }

  // ── 知识库 ──
  async listKnowledge(q?: string): Promise<KnowledgeEntry[]> {
    let query = this.tbl("knowledge_entries").select("*").order("created_at", { ascending: true });
    if (q) {
      // Escape LIKE first, then the quoted PostgREST value so punctuation stays search text.
      const literal = q.replace(/[\\%_]/g, "\\$&").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      query = query.or(`title.ilike."%${literal}%",content.ilike."%${literal}%"`);
    }
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
  async ensureChatSession(sessionId: string, mode: ChatMode, title: string, ownerId: string): Promise<void> {
    if (!ownerId) throw new StoreAccessError();
    const { error } = await this.sb.rpc("ensure_chat_session", {
      p_session_id: sessionId, p_mode: mode, p_title: title, p_owner_id: ownerId,
    });
    if (error?.code === "42501") throw new StoreAccessError();
    if (error) throw new Error(`Supabase 写入 chat_sessions 失败: ${error.message}`);
  }

  async addChatMessages(
    sessionId: string,
    msgs: { role: "user" | "assistant"; content: string }[],
    ownerId: string
  ): Promise<void> {
    if (!ownerId) throw new StoreAccessError();
    if (!msgs.length) return;
    const { error } = await this.sb.rpc("append_chat_messages", {
      p_session_id: sessionId, p_owner_id: ownerId, p_messages: msgs,
    });
    if (error?.code === "42501") throw new StoreAccessError();
    if (error) throw new Error(`Supabase 写入 chat_messages 失败: ${error.message}`);
  }

  async addGeneratedImage(g: Omit<GeneratedImage, "id" | "createdAt">): Promise<GeneratedImage> {
    const row = {
      id: id(),
      prompt: g.prompt,
      url: g.url,
      organ_id: g.organId ?? null,
      owner_id: g.ownerId,
      created_at: now(),
    };
    const { error } = await this.tbl("generated_images").insert(row);
    if (error) throw new Error(`Supabase 写入 generated_images 失败: ${error.message}`);
    return { ...g, id: row.id, createdAt: row.created_at };
  }
}
