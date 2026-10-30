import { agnesChatJSON, agnesConfigured, AgnesError } from "./agnes";
import { getStore } from "./store";
import { getRetriever } from "./knowledge";
import { normalizePlan, object, textField, ValidationError } from "./validation";
import { ApiError } from "./http";
import { SIMULATION_SYSTEM, fallbackSimulationSteps, normalizeSimSteps,
  planGenerateSystem, planGenerateUser, planRefineSystem, planRefineUser, simulationUser } from "./planning-prompt";
import type { PlanDetail, SimulationStep, StructuredPlan } from "./types";
import type { Actor } from "./auth";

/** AI 在事务外运行，校验后的方案、模拟和反馈最后一次原子提交。 */
export async function generatePlan(detail: PlanDetail, actor: Actor, signal: AbortSignal, comment?: string) {
  if (!agnesConfigured()) throw new ApiError("AGNES_API_KEY 未配置，请配置后重启服务", 503);
  const current = detail.versions.find((v) => v.version === detail.plan.currentVersion);
  if (comment && !current) throw new ApiError("该规划尚无有效方案，无法修订", 400);
  const feedback = comment ? { expertName: actor.name, comment, version: detail.plan.currentVersion } : undefined;
  const knowledge = await getRetriever().retrieve({
    text: `${comment ?? detail.patient.preliminaryPlan}\n${detail.patient.medicalRecord}`, topK: 4,
  });
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
    changelog = feedback ? textField(raw, "changelog", 6000) : detail.plan.currentVersion ? "AI 重新生成" : "初版：依据病历与知识库生成";
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
  const committed = await getStore().commitPlan({ planId: detail.plan.id, ownerId: actor.id,
    expectedVersion: detail.plan.currentVersion, content, changelog,
    source: feedback ? "expert_refine" : "ai", knowledgeUsed: knowledge.map((k) => k.title),
    simulation: { focusOrgan: content.focusOrgan, region: content.region, steps }, feedback });
  return { ...committed, changelog, knowledge: knowledge.map((k) => k.title) };
}
