// 专家反馈 → AI 修订手术规划 → 新版本 + 新模拟。
// 体现"通过专家反馈完善手术方案"的闭环。
import { NextRequest } from "next/server";
import { agnesChatJSON, agnesConfigured, AgnesError } from "@/lib/agnes";
import { getStore } from "@/lib/store";
import { getRetriever } from "@/lib/knowledge";
import {
  SIMULATION_SYSTEM,
  fallbackSimulationSteps,
  normalizeSimSteps,
  planRefineSystem,
  planRefineUser,
  simulationUser,
} from "@/lib/planning-prompt";
import { matchOrgan, normalizeRegion } from "@/lib/organ-models";
import type { SimulationStep, StructuredPlan } from "@/lib/types";

export const maxDuration = 300;

interface FeedbackBody {
  expertName?: string;
  comment: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;
  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const comment = (body.comment ?? "").trim();
  if (!comment) return Response.json({ error: "反馈内容不能为空" }, { status: 400 });

  const store = getStore();
  const detail = await store.getPlanDetail(planId);
  if (!detail) return Response.json({ error: "未找到该手术规划" }, { status: 404 });
  if (!detail.versions.length) {
    return Response.json({ error: "该规划尚未生成 AI 方案，无法反馈" }, { status: 400 });
  }
  if (!agnesConfigured()) {
    return Response.json({ error: "AGNES_API_KEY 未配置" }, { status: 500 });
  }

  const current = detail.versions[detail.versions.length - 1];
  const nextVersion = current.version + 1;

  // 1. 保存专家反馈
  const feedback = await store.addFeedback({
    planId,
    version: current.version,
    expertName: body.expertName?.trim() || "专家",
    comment,
  });

  // 2. 知识库检索（反馈中提到的主题优先）
  const retriever = getRetriever();
  const knowledge = await retriever
    .retrieve({ text: `${comment}\n${detail.patient.medicalRecord}`, topK: 3 })
    .catch(() => []);

  // 3. AI 修订
  let plan: StructuredPlan;
  let changelog = "";
  try {
    const raw = await agnesChatJSON<Partial<StructuredPlan> & { changelog?: string }>(
      [
        { role: "system", content: planRefineSystem() },
        {
          role: "user",
          content: planRefineUser(
            detail.patient,
            current,
            feedback,
            knowledge.map((k) => ({ title: k.title, content: k.content }))
          ),
        },
      ],
      { maxTokens: 8192 }
    );
    plan = {
      ...current.content,
      ...raw,
      region: normalizeRegion(
        String(raw.region ?? current.content.region ?? ""),
        String(raw.focusOrgan ?? current.content.focusOrgan ?? "")
      ),
      steps: Array.isArray(raw.steps)
        ? raw.steps.slice(0, 12).map((s, i) => ({
            index: Number(s?.index ?? i + 1) || i + 1,
            name: String(s?.name ?? `步骤${i + 1}`),
            detail: String(s?.detail ?? ""),
            duration: String(s?.duration ?? ""),
            risk: String(s?.risk ?? ""),
            keyPoints: Array.isArray(s?.keyPoints) ? s.keyPoints.map(String) : [],
          }))
        : current.content.steps,
      risks: Array.isArray(raw.risks)
        ? raw.risks.slice(0, 12).map((r) => ({
            risk: String(r?.risk ?? ""),
            mitigation: String(r?.mitigation ?? ""),
          }))
        : current.content.risks,
      focusOrgan: matchOrgan(String(raw.focusOrgan ?? current.content.focusOrgan)),
    };
    changelog = String(raw.changelog ?? "已按专家反馈修订");
  } catch (e) {
    const msg = e instanceof AgnesError ? e.message : String(e);
    return Response.json({ error: `方案修订失败：${msg}` }, { status: 502 });
  }

  const version = await store.addPlanVersion({
    planId,
    version: nextVersion,
    content: plan,
    changelog,
    source: "expert_refine",
    knowledgeUsed: knowledge.map((k) => k.title),
  });

  // 4. 为新版本重新编排模拟
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
  const simulation = await store.addSimulation({
    planId,
    version: nextVersion,
    focusOrgan: plan.focusOrgan,
    region: plan.region,
    steps,
  });

  return Response.json({ version, simulation, feedback, changelog });
}
