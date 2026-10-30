// 专家反馈 → AI 修订手术规划 → 新版本 + 新模拟。
// 体现"通过专家反馈完善手术方案"的闭环。
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
  planRefineSystem,
  planRefineUser,
  simulationUser,
} from "@/lib/planning-prompt";
import { matchOrgan, normalizeRegion } from "@/lib/organ-models";
import type { ExpertFeedback, PlanVersion, SimulationRun, SimulationStep, StructuredPlan } from "@/lib/types";

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
  if (!body || typeof body !== "object" || typeof body.comment !== "string" ||
      (body.expertName !== undefined && typeof body.expertName !== "string")) {
    return Response.json({ error: "反馈字段格式不正确" }, { status: 400 });
  }
  if (body.comment.length > 16000 || (body.expertName?.length ?? 0) > 200) {
    return Response.json({ error: "反馈内容过长" }, { status: 400 });
  }
  const comment = body.comment.trim();
  if (!comment) return Response.json({ error: "反馈内容不能为空" }, { status: 400 });

  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
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

  if (current.version !== detail.plan.currentVersion) {
    return Response.json({ error: "规划版本状态不一致，请联系管理员" }, { status: 409 });
  }
  const feedback: ExpertFeedback = {
    id: id(), createdAt: now(), planId, version: current.version,
    expertName: body.expertName?.trim() || "专家", comment,
  };

  // 2. 知识库检索（反馈中提到的主题优先）
  const retriever = getRetriever(store);
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
  const createdAt = now();
  const version: PlanVersion = {
    id: id(), createdAt, planId, version: nextVersion, content: plan, changelog,
    source: "expert_refine", knowledgeUsed: knowledge.map((k) => k.title),
  };
  const simulation: SimulationRun = {
    id: id(), createdAt, planId, version: nextVersion,
    focusOrgan: plan.focusOrgan, region: plan.region, steps,
  };
  try {
    await store.saveRevision({ expectedVersion: current.version, version, simulation, feedback });
  } catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }

  return Response.json({ version, simulation, feedback, changelog });
}
