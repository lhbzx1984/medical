import { getStore } from "@/lib/store";
import { CaseNotFoundError, RevisionConflictError } from "@/lib/store/supabase";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.archived !== "boolean" || typeof body.expectedUpdatedAt !== "string" ||
      !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
    return Response.json({ error: "归档请求格式不正确" }, { status: 400 });
  }
  try {
    await store.setArchived((await params).id, body.expectedUpdatedAt, body.archived);
  } catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof CaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
  return Response.json({ ok: true });
}
