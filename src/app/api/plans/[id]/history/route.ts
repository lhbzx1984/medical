import { apiError, requireStore } from "@/lib/http";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const store = await requireStore();
    const { id } = await params;
    const detail = await store.getPlanDetail(id);
    if (!detail) return Response.json({ error: "未找到该病例" }, { status: 404 });
    return Response.json({ edits: await store.listCaseEdits(id) });
  } catch (error) { return apiError(error); }
}
