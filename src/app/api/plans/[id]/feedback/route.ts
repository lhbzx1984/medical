// 专家反馈 → AI 修订手术规划 → 新版本 + 新模拟。
// 体现"通过专家反馈完善手术方案"的闭环。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { requireActor } from "@/lib/auth";
import { apiError, ApiError, limitAction } from "@/lib/http";
import { readJson, textField, integerField } from "@/lib/validation";
import { generatePlan } from "@/lib/plan-generation";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 修订与模拟共用总预算，不能每次调用重新计算 240 秒。
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(270_000)]);
    const actor = await requireActor(req, "expert");
    const body = await readJson(req);
    const comment = textField(body, "comment", 5000);
    const { id } = await params;
    const store = getStore();
    const detail = await store.getPlanDetail(id, actor.id);
    if (!detail) throw new ApiError("未找到该手术规划或无权访问", 404);
    if (body.baseVersion !== undefined &&
        integerField(body.baseVersion, 1, Number.MAX_SAFE_INTEGER, "baseVersion") !== detail.plan.currentVersion) {
      throw new ApiError("当前查看的方案已过期，请选择最新版本后反馈", 409);
    }
    await limitAction(store, actor.id, "plan-refine", 5);
    signal.throwIfAborted();
    return Response.json(await generatePlan(detail, actor, signal, comment));
  } catch (error) { return apiError(error); }
}
