import { agnesChatJSON, agnesConfigured, AgnesError } from "@/lib/agnes";
import { ApiError } from "@/lib/http";
import { getRetriever } from "@/lib/knowledge";
import { SIMULATION_SYSTEM, fallbackSimulationSteps, normalizeSimSteps,
  planGenerateSystem, planGenerateUser, planRefineSystem, planRefineUser, simulationUser } from "@/lib/planning-prompt";
import { id, now } from "@/lib/store/base";
import type { SupabaseStore } from "@/lib/store/supabase";
import type { ExpertFeedback, PlanDetail, PlanVersion, SimulationRun, SimulationStep, StructuredPlan } from "@/lib/types";
import { normalizePlan, object, textField, ValidationError } from "@/lib/validation";

/** AI 在数据库写入之外运行；校验后的方案、模拟和反馈最后由 medplan_save_revision 一次提交。 */
export async function generatePlan(store: SupabaseStore, detail: PlanDetail, signal: AbortSignal, comment?: string) {
  if (!agnesConfigured()) throw new ApiError("AGNES_API_KEY 未配置，请配置后重启服务", 503);
  const current = detail.versions.find((v) => v.version === detail.plan.currentVersion);
  if (comment && !current) throw new ApiError("该规划尚无有效方案，无法修订", 400);
  if (!(await store.consumeAiQuota("plan"))) throw new ApiError("请求过于频繁，请稍后再试", 429);
  const planId = detail.plan.id;
  const createdAt = now();
  const feedback: ExpertFeedback | undefined = comment
    ? { id: id(), createdAt, planId, version: detail.plan.currentVersion, expertName: store.actor.name, comment }
    : undefined;
  const knowledge = await getRetriever(store)
    .retrieve({ text: `${comment ?? detail.patient.preliminaryPlan}\n${detail.patient.medicalRecord}`, topK: 4 })
    .catch(() => []);
  const references = knowledge.map((k) => ({ title: k.title, content: k.content }));
  let content: StructuredPlan;
  let changelog: string;
  try {
    const raw = object(await agnesChatJSON<unknown>([
      { role: "system", content: feedback ? planRefineSystem() : planGenerateSystem() },
      { role: "user", content: feedback && current
        ? planRefineUser(detail.patient, current, feedback, references)
        : planGenerateUser(detail.patient, references) },
    ], { maxTokens: 8192, signal }));
    content = normalizePlan(raw);
    changelog = feedback
      ? textField(raw, "changelog", 6000, true) || "已按专家反馈修订"
      : detail.plan.currentVersion ? "AI 重新生成" : "初版：由 AI 依据病历、初步方案与知识库生成";
  } catch (error) {
    if (error instanceof ValidationError) throw new AgnesError(`AI 方案结构不完整：${error.message}`);
    throw error;
  }
  let steps: SimulationStep[];
  try {
    const sim = await agnesChatJSON<{ steps?: unknown }>([
      { role: "system", content: SIMULATION_SYSTEM }, { role: "user", content: simulationUser(content) },
    ], { maxTokens: 4096, signal });
    steps = normalizeSimSteps(sim.steps);
    if (!steps.length) throw new Error("空模拟脚本");
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    steps = fallbackSimulationSteps(content).steps;
  }
  signal.throwIfAborted();
  const nextVersion = detail.plan.currentVersion + 1;
  const version: PlanVersion = {
    id: id(), createdAt, planId, version: nextVersion, content, changelog,
    source: feedback ? "expert_refine" : "ai", knowledgeUsed: knowledge.map((k) => k.title),
    knowledgeReferences: knowledge.map((k) => ({ id: k.id, title: k.title, content: k.content,
      sourceName: k.sourceName ?? "", sourceUrl: k.sourceUrl ?? "", sourceVersion: k.sourceVersion ?? "",
      reviewedBy: k.reviewedBy ?? "", reviewedAt: k.reviewedAt ?? null, updatedAt: k.updatedAt ?? "" })),
  };
  const simulation: SimulationRun = {
    id: id(), createdAt, planId, version: nextVersion,
    focusOrgan: content.focusOrgan, region: content.region, steps,
  };
  await store.saveRevision({ expectedVersion: detail.plan.currentVersion,
    expectedUpdatedAt: detail.plan.updatedAt, version, simulation, feedback });
  return { version, simulation, ...(feedback ? { feedback } : {}), changelog, knowledge: knowledge.map((k) => k.title) };
}
