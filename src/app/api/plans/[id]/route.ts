// 手术规划详情（含版本历史、专家反馈、模拟记录）。
import { getStore } from "@/lib/store";


export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const detail = await getStore().getPlanDetail(id);
  if (!detail) return Response.json({ error: "未找到该手术规划" }, { status: 404 });
  return Response.json(detail);
}
