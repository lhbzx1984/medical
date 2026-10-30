import { getAdminStore } from "@/lib/admin";
import { CaseNotFoundError, RevisionConflictError } from "@/lib/store/supabase";
import { apiError, assertSameOrigin } from "@/lib/http";
export async function GET() {
  const auth = await getAdminStore();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  return Response.json({ patients: await auth.store.listUnassignedPatients() });
}
export async function POST(req: Request) {
  try { assertSameOrigin(req); } catch (error) { return apiError(error); }
  const auth = await getAdminStore();
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "请求格式不正确" }, { status: 400 });
  const { patientId, ownerId } = body as Record<string, unknown>;
  const valid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!valid(patientId) || !valid(ownerId)) return Response.json({ error: "病例或用户 ID 不正确" }, { status: 400 });
  try { await auth.store.assignUnassignedPatient(patientId, ownerId); }
  catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: "病例已被分配，请刷新列表" }, { status: 409 });
    if (error instanceof CaseNotFoundError) return Response.json({ error: "未找到病例或用户" }, { status: 404 });
    throw error;
  }
  return Response.json({ ok: true });
}
