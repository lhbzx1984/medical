// AI 生成术前手术规划 + 自动编排 3D 模拟。
// 流程：知识检索 → 生成并校验方案 → 编排模拟 → 原子提交方案与模拟 → 返回新版本。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { requireActor } from "@/lib/auth";
import { apiError, limitAction } from "@/lib/http";
import { generatePlan } from "@/lib/plan-generation";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 两轮 AI 共用总预算，为 300 秒路由上限内的提交和响应留出时间。
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(270_000)]);
    const actor = await requireActor(req);
    const { id } = await params;
    const store = getStore();
    const detail = await store.getPlanDetail(id, actor.id);
    if (!detail) return Response.json({ error: "未找到该手术规划或无权访问" }, { status: 404 });
    await limitAction(store, actor.id, "plan-generate", 5);
    signal.throwIfAborted();
    return Response.json(await generatePlan(detail, actor, signal));
  } catch (error) { return apiError(error); }
}
