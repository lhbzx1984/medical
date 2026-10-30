// AI 生成术前手术规划 + 自动编排 3D 模拟。
// 流程：知识库检索 → Agnes 生成结构化方案（JSON）→ 校验落库 → 生成模拟播放脚本 → 返回新版本。
import { NextRequest } from "next/server";
import { agnesChatJSON, agnesConfigured, AgnesError } from "@/lib/agnes";
import { getStore } from "@/lib/store";
import { RevisionConflictError } from "@/lib/store/supabase";
import { id, now } from "@/lib/store/base";
import { getRetriever } from "@/lib/knowledge";
import {
  SIMULATION_SYSTEM,
  fallbackSimulationSteps,
  normalizeSimSteps,
  planGenerateSystem,
  planGenerateUser,
  simulationUser,
} from "@/lib/planning-prompt";
import { matchOrgan, normalizeRegion } from "@/lib/organ-models";
import type { PlanVersion, SimulationRun, SimulationStep, StructuredPlan } from "@/lib/types";

export const maxDuration = 300;

function normalizePlan(raw: Partial<StructuredPlan>): StructuredPlan {
  const focusOrgan = matchOrgan(String(raw.focusOrgan ?? ""));
  return {
    summary: String(raw.summary ?? ""),
    diagnosis: String(raw.diagnosis ?? ""),
    procedureName: String(raw.procedureName ?? "待定术式"),
    anesthesia: String(raw.anesthesia ?? ""),
    position: String(raw.position ?? ""),
    approach: String(raw.approach ?? ""),
    region: normalizeRegion(String(raw.region ?? ""), String(raw.focusOrgan ?? "")),
    instruments: Array.isArray(raw.instruments) ? raw.instruments.map(String).slice(0, 40) : [],
    steps: Array.isArray(raw.steps)
      ? raw.steps.slice(0, 12).map((s, i) => ({
          index: Number(s?.index ?? i + 1) || i + 1,
          name: String(s?.name ?? `步骤${i + 1}`),
          detail: String(s?.detail ?? ""),
          duration: String(s?.duration ?? ""),
          risk: String(s?.risk ?? ""),
          keyPoints: Array.isArray(s?.keyPoints) ? s.keyPoints.map(String) : [],
        }))
      : [],
    risks: Array.isArray(raw.risks)
      ? raw.risks.slice(0, 12).map((r) => ({
          risk: String(r?.risk ?? ""),
          mitigation: String(r?.mitigation ?? ""),
        }))
      : [],
    postop: Array.isArray(raw.postop) ? raw.postop.map(String) : [],
    focusOrgan,
    simulationNotes: String(raw.simulationNotes ?? ""),
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const detail = await store.getPlanDetail(planId);
  if (!detail) return Response.json({ error: "未找到该手术规划" }, { status: 404 });
  if (detail.plan.status === "finalized") return Response.json({ error: "方案已定稿，请先撤销定稿" }, { status: 409 });
  if (!agnesConfigured()) {
    return Response.json(
      { error: "AGNES_API_KEY 未配置：请在 .env.local 中设置后重启服务" },
      { status: 500 }
    );
  }

  if (!(await store.consumeAiQuota("plan"))) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  const nextVersion = detail.plan.currentVersion + 1;

  // 1. 手术知识库检索增强（接口预留：可切换向量检索实现）
  const retriever = getRetriever(store);
  const knowledge = await retriever
    .retrieve({
      text: `${detail.patient.medicalRecord}\n${detail.patient.preliminaryPlan}`,
      topK: 4,
    })
    .catch(() => []);

  // 2. 生成结构化手术方案
  let plan: StructuredPlan;
  try {
    const raw = await agnesChatJSON<Partial<StructuredPlan>>(
      [
        { role: "system", content: planGenerateSystem() },
        {
          role: "user",
          content: planGenerateUser(
            detail.patient,
            knowledge.map((k) => ({ title: k.title, content: k.content }))
          ),
        },
      ],
      { maxTokens: 8192 }
    );
    plan = normalizePlan(raw);
  } catch (e) {
    const msg = e instanceof AgnesError ? e.message : String(e);
    return Response.json({ error: `手术方案生成失败：${msg}` }, { status: 502 });
  }

  // 3. 模拟编排（LLM 失败时降级为规则合成，保证模拟始终可用）
  let steps: SimulationStep[];
  try {
    const sim = await agnesChatJSON<{ steps?: SimulationStep[] }>(
      [
        { role: "system", content: SIMULATION_SYSTEM },
        { role: "user", content: simulationUser(plan) },
      ],
      { maxTokens: 4096 }
    );
    steps = normalizeSimSteps(sim.steps);
    if (!steps.length) throw new Error("空脚本");
  } catch {
    steps = fallbackSimulationSteps(plan).steps;
  }
  const createdAt = now();
  const version: PlanVersion = {
    id: id(), createdAt, planId, version: nextVersion, content: plan,
    changelog: nextVersion === 1 ? "初版：由 AI 依据病历、初步方案与知识库生成" : "AI 重新生成",
    source: "ai", knowledgeUsed: knowledge.map((k) => k.title),
    knowledgeReferences: knowledge.map((k) => ({ id: k.id, title: k.title, content: k.content,
      sourceName: k.sourceName ?? "", sourceUrl: k.sourceUrl ?? "", sourceVersion: k.sourceVersion ?? "",
      reviewedBy: k.reviewedBy ?? "", reviewedAt: k.reviewedAt ?? null, updatedAt: k.updatedAt ?? "" })),
  };
  const simulation: SimulationRun = {
    id: id(), createdAt, planId, version: nextVersion,
    focusOrgan: plan.focusOrgan, region: plan.region, steps,
  };
  try {
    await store.saveRevision({ expectedVersion: detail.plan.currentVersion, expectedUpdatedAt: detail.plan.updatedAt, version, simulation });
  } catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }

  return Response.json({ version, simulation, knowledge: knowledge.map((k) => k.title) });
}
