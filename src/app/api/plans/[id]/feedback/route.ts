// 专家反馈 → AI 修订手术规划 → 新版本 + 新模拟。
// 体现"通过专家反馈完善手术方案"的闭环。
import { NextRequest } from "next/server";
import { apiError, ApiError, assertSameOrigin, requireStore } from "@/lib/http";
import { generatePlan } from "@/lib/plan-generation";
import { readJson, textField, integerField } from "@/lib/validation";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(req);
    // 修订与模拟共用总预算，不能每次调用重新计算 240 秒。
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(270_000)]);
    const store = await requireStore();
    const body = await readJson(req);
    const comment = textField(body, "comment", 5000);
    const version = integerField(body.version, 1, Number.MAX_SAFE_INTEGER, "version");
    const { id } = await params;
    const detail = await store.getPlanDetail(id);
    if (!detail) throw new ApiError("未找到该手术规划", 404);
    if (detail.plan.status === "finalized") throw new ApiError("方案已定稿，请先撤销定稿", 409);
    const current = detail.versions[detail.versions.length - 1];
    if (!current) throw new ApiError("该规划尚未生成 AI 方案，无法反馈", 400);
    if (current.version !== detail.plan.currentVersion) throw new ApiError("规划版本状态不一致，请联系管理员", 409);
    if (version !== current.version) throw new ApiError("只能对最新版本提交反馈，请刷新并选择最新版本", 409);
    signal.throwIfAborted();
    return Response.json(await generatePlan(store, detail, signal, comment));
  } catch (error) { return apiError(error); }
}
