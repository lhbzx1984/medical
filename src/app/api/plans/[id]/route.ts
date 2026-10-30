// 手术规划详情（含版本历史、专家反馈、模拟记录）。
import { getStore } from "@/lib/store";
import { requireActor } from "@/lib/auth";
import { apiError } from "@/lib/http";


export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor(req);
    const { id } = await params;
    const detail = await getStore().getPlanDetail(id, actor.id);
    if (!detail) return Response.json({ error: "未找到该手术规划或无权访问" }, { status: 404 });
    return Response.json(detail);
  } catch (error) { return apiError(error); }
}
