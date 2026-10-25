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
import { DataStore, id, NewPatient, now } from "./base";

interface MemDb {
  patients: Map<string, Patient>;
  plans: Map<string, SurgicalPlan>;
  versions: PlanVersion[];
  feedbacks: ExpertFeedback[];
  simulations: SimulationRun[];
  knowledge: KnowledgeEntry[];
  chatSessions: Map<string, { id: string; mode: ChatMode; title: string }>;
  chatMessages: { sessionId: string; role: "user" | "assistant"; content: string; createdAt: string }[];
  images: GeneratedImage[];
}

// 用 globalThis 缓存，避免开发模式热更新时丢数据
const g = globalThis as unknown as { __medplanMemDb?: MemDb };

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

  async createPatient(input: NewPatient): Promise<Patient> {
    const p: Patient = {
      id: id(),
      name: input.name,
      gender: input.gender ?? "",
      age: input.age ?? 0,
      medicalRecord: input.medicalRecord ?? "",
      preliminaryPlan: input.preliminaryPlan ?? "",
      createdAt: now(),
    };
    db().patients.set(p.id, p);
    return p;
  }

  async getPatient(pid: string): Promise<Patient | null> {
    return db().patients.get(pid) ?? null;
  }

  async listPatients(): Promise<Patient[]> {
    return [...db().patients.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createPlan(input: { patientId: string; title?: string }): Promise<SurgicalPlan> {
    const patient = db().patients.get(input.patientId);
    const plan: SurgicalPlan = {
      id: id(),
      patientId: input.patientId,
      title: input.title || `${patient?.name ?? "病例"}·手术规划`,
      patientName: patient?.name ?? "",
      status: "draft",
      currentVersion: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    db().plans.set(plan.id, plan);
    return plan;
  }

  async listPlans(): Promise<SurgicalPlan[]> {
    return [...db().plans.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getPlanDetail(planId: string): Promise<PlanDetail | null> {
    const d = db();
    const plan = d.plans.get(planId);
    if (!plan) return null;
    const patient = d.patients.get(plan.patientId);
    if (!patient) return null;
    return {
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
    };
  }

  async addPlanVersion(v: Omit<PlanVersion, "id" | "createdAt">): Promise<PlanVersion> {
    const version: PlanVersion = { ...v, id: id(), createdAt: now() };
    const d = db();
    d.versions.push(version);
    const plan = d.plans.get(v.planId);
    if (plan) {
      plan.currentVersion = Math.max(plan.currentVersion, v.version);
      plan.status = v.source === "expert_refine" ? "refined" : plan.status === "draft" ? "simulated" : plan.status;
      plan.updatedAt = now();
    }
    return version;
  }

  async addFeedback(f: Omit<ExpertFeedback, "id" | "createdAt">): Promise<ExpertFeedback> {
    const fb: ExpertFeedback = { ...f, id: id(), createdAt: now() };
    db().feedbacks.push(fb);
    return fb;
  }

  async addSimulation(s: Omit<SimulationRun, "id" | "createdAt">): Promise<SimulationRun> {
    const sim: SimulationRun = { ...s, id: id(), createdAt: now() };
    db().simulations.push(sim);
    return sim;
  }

  async updatePlanStatus(
    planId: string,
    patch: Partial<Pick<SurgicalPlan, "status" | "currentVersion" | "title">>
  ): Promise<void> {
    const plan = db().plans.get(planId);
    if (!plan) return;
    Object.assign(plan, patch, { updatedAt: now() });
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

  async ensureChatSession(sessionId: string, mode: ChatMode, title: string): Promise<void> {
    const d = db();
    if (!d.chatSessions.has(sessionId)) {
      d.chatSessions.set(sessionId, { id: sessionId, mode, title });
    }
  }

  async addChatMessages(
    sessionId: string,
    msgs: { role: "user" | "assistant"; content: string }[]
  ): Promise<void> {
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
