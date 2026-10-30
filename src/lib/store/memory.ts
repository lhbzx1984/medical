// 内置演示存储：无 Supabase 配置时的降级实现（进程内存，开发/演示用）。
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
import { SEED_KNOWLEDGE } from "../knowledge/seed";
import { DataStore, id, NewCase, now, PlanCommitInput, PlanCommitResult, StoreAccessError, StoreConflictError } from "./base";

interface MemDb {
  patients: Map<string, Patient>;
  plans: Map<string, SurgicalPlan>;
  versions: PlanVersion[];
  feedbacks: ExpertFeedback[];
  simulations: SimulationRun[];
  knowledge: KnowledgeEntry[];
  chatSessions: Map<string, { id: string; mode: ChatMode; title: string; ownerId: string }>;
  chatMessages: { sessionId: string; role: "user" | "assistant"; content: string; createdAt: string }[];
  images: GeneratedImage[];
}

// 用 globalThis 缓存，避免开发模式热更新时丢数据
const g = globalThis as unknown as {
  __medplanMemDb?: MemDb;
  __medplanRateWindows?: Map<string, { expires: number; count: number }>;
};

function db(): MemDb {
  if (!g.__medplanMemDb) {
    g.__medplanMemDb = {
      patients: new Map(),
      plans: new Map(),
      versions: [],
      feedbacks: [],
      simulations: [],
      knowledge: SEED_KNOWLEDGE.map((k) => ({ ...k, id: id(), createdAt: now() })),
      chatSessions: new Map(),
      chatMessages: [],
      images: [],
    };
  }
  return g.__medplanMemDb;
}

export class MemoryStore implements DataStore {
  readonly kind = "memory" as const;

  async createCase(input: NewCase): Promise<{ patient: Patient; plan: SurgicalPlan }> {
    if (!input.ownerId) throw new StoreAccessError();
    const patient: Patient = {
      id: id(),
      name: input.name,
      gender: input.gender ?? "",
      age: input.age ?? 0,
      medicalRecord: input.medicalRecord ?? "",
      preliminaryPlan: input.preliminaryPlan ?? "",
      createdAt: now(),
    };
    const plan: SurgicalPlan = {
      id: id(),
      patientId: patient.id,
      ownerId: input.ownerId,
      title: input.title || `${patient.name}·手术规划`,
      patientName: patient.name,
      status: "draft",
      currentVersion: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    const result = structuredClone({ patient, plan });
    const d = db();
    d.patients.set(patient.id, patient);
    d.plans.set(plan.id, plan);
    return result;
  }

  async listPlans(ownerId: string): Promise<SurgicalPlan[]> {
    if (!ownerId) throw new StoreAccessError();
    return structuredClone([...db().plans.values()].filter(p => p.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async getPlanDetail(planId: string, ownerId: string): Promise<PlanDetail | null> {
    if (!ownerId) throw new StoreAccessError();
    const d = db();
    const plan = d.plans.get(planId);
    if (!plan || plan.ownerId !== ownerId) return null;
    const patient = d.patients.get(plan.patientId);
    if (!patient) return null;
    return structuredClone({
      plan,
      patient,
      versions: d.versions
        .filter((v) => v.planId === planId)
        .sort((a, b) => a.version - b.version),
      feedbacks: d.feedbacks
        .filter((f) => f.planId === planId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      simulations: d.simulations
        .filter((s) => s.planId === planId)
        .sort((a, b) => a.version - b.version),
    });
  }

  async commitPlan(input: PlanCommitInput): Promise<PlanCommitResult> {
    const d = db();
    const plan = d.plans.get(input.planId);
    if (!input.ownerId || !plan || plan.ownerId !== input.ownerId) throw new StoreAccessError();
    if (plan.currentVersion !== input.expectedVersion) throw new StoreConflictError();
    const nextVersion = input.expectedVersion + 1;
    const createdAt = now();
    const version: PlanVersion = { id: id(), planId: plan.id, version: nextVersion,
      content: input.content, changelog: input.changelog, source: input.source,
      knowledgeUsed: input.knowledgeUsed, createdAt };
    const simulation: SimulationRun = { id: id(), planId: plan.id, version: nextVersion,
      ...input.simulation, createdAt };
    const feedback: ExpertFeedback | undefined = input.feedback ? { id: id(), planId: plan.id,
      version: input.expectedVersion, ...input.feedback, createdAt } : undefined;
    const result = structuredClone({ version, simulation, ...(feedback ? { feedback } : {}) });
    // No await between the version check and all writes: a stale concurrent result cannot commit.
    d.versions.push(result.version);
    d.simulations.push(result.simulation);
    if (result.feedback) d.feedbacks.push(result.feedback);
    plan.currentVersion = nextVersion;
    plan.status = input.source === "expert_refine" ? "refined" : "simulated";
    plan.updatedAt = createdAt;
    return structuredClone(result);
  }

  async consumeRateLimit(ownerId: string, action: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!ownerId) throw new StoreAccessError();
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
      throw new RangeError("无效的限流配置");
    }
    const windows = g.__medplanRateWindows ??= new Map();
    const timestamp = Date.now();
    for (const [key, value] of windows) if (value.expires <= timestamp) windows.delete(key);
    const key = JSON.stringify([ownerId, action]);
    const current = windows.get(key);
    if (!current) {
      // shortcut: demo storage is one process; production uses the shared database counter.
      if (windows.size >= 10_000) return false;
      windows.set(key, {count: 1, expires: (Math.floor(timestamp / (windowSeconds * 1000)) + 1) * windowSeconds * 1000});
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  async listKnowledge(q?: string): Promise<KnowledgeEntry[]> {
    let items = [...db().knowledge];
    if (q) {
      const k = q.toLowerCase();
      items = items.filter(
        (e) =>
          e.title.toLowerCase().includes(k) ||
          e.content.toLowerCase().includes(k) ||
          e.tags.some((t) => t.toLowerCase().includes(k))
      );
    }
    return items.sort((a, b) => a.title.localeCompare(b.title));
  }

  async addKnowledge(e: Omit<KnowledgeEntry, "id" | "createdAt">): Promise<KnowledgeEntry> {
    const entry: KnowledgeEntry = { ...e, id: id(), createdAt: now() };
    db().knowledge.push(entry);
    return entry;
  }

  async ensureChatSession(sessionId: string, mode: ChatMode, title: string, ownerId: string): Promise<void> {
    const d = db();
    const existing = d.chatSessions.get(sessionId);
    if (!ownerId || (existing && existing.ownerId !== ownerId)) throw new StoreAccessError();
    if (!existing) d.chatSessions.set(sessionId, { id: sessionId, mode, title, ownerId });
  }

  async addChatMessages(
    sessionId: string,
    msgs: { role: "user" | "assistant"; content: string }[],
    ownerId: string
  ): Promise<void> {
    if (!ownerId || db().chatSessions.get(sessionId)?.ownerId !== ownerId) throw new StoreAccessError();
    for (const m of msgs) {
      db().chatMessages.push({ sessionId, ...m, createdAt: now() });
    }
  }

  async addGeneratedImage(gimg: Omit<GeneratedImage, "id" | "createdAt">): Promise<GeneratedImage> {
    const img: GeneratedImage = { ...gimg, id: id(), createdAt: now() };
    db().images.push(img);
    return img;
  }
}
