import { getStore } from "@/lib/store";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const detail = await store.getPlanDetail(id);
  if (!detail) return Response.json({ error: "未找到该病例" }, { status: 404 });
  return Response.json({ edits: await store.listCaseEdits(id) });
}
