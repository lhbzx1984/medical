// AI 生成术前手术规划 + 自动编排 3D 模拟。
// 流程：知识检索 → 生成并校验方案 → 编排模拟 → 原子提交方案与模拟 → 返回新版本。
import { NextRequest } from "next/server";
import { apiError, ApiError, assertSameOrigin, requireStore } from "@/lib/http";
import { generatePlan } from "@/lib/plan-generation";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(req);
    // 两轮 AI 共用总预算，为 300 秒路由上限内的提交和响应留出时间。
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(270_000)]);
    const { id } = await params;
    const store = await requireStore();
    const detail = await store.getPlanDetail(id);
    if (!detail) throw new ApiError("未找到该手术规划", 404);
    if (detail.plan.status === "finalized") throw new ApiError("方案已定稿，请先撤销定稿", 409);
    signal.throwIfAborted();
    return Response.json(await generatePlan(store, detail, signal));
  } catch (error) { return apiError(error); }
}
