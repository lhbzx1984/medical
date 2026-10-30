// 手术规划详情（含版本历史、专家反馈、模拟记录）。
import { getStore } from "@/lib/store";
import { CaseNotFoundError, RevisionConflictError } from "@/lib/store/supabase";


export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const detail = await store.getPlanDetail(id);
  if (!detail) return Response.json({ error: "未找到该手术规划" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "病例格式不正确" }, { status: 400 });
  const v = body as Record<string, unknown>;
  if (typeof v.patientName !== "string" || !v.patientName.trim() || v.patientName.length > 200 ||
      typeof v.gender !== "string" || v.gender.length > 50 || !Number.isInteger(v.age) ||
      (v.age as number) < 0 || (v.age as number) > 150 ||
      typeof v.medicalRecord !== "string" || v.medicalRecord.length > 50000 ||
      typeof v.preliminaryPlan !== "string" || v.preliminaryPlan.length > 50000 ||
      typeof v.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(v.expectedUpdatedAt))) {
    return Response.json({ error: "病例字段格式不正确或内容过长" }, { status: 400 });
  }
  const { id } = await params;
  try {
    await store.updateCase(id, v.expectedUpdatedAt, {
      name: v.patientName.trim(), gender: v.gender, age: v.age as number,
      medicalRecord: v.medicalRecord, preliminaryPlan: v.preliminaryPlan,
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof CaseNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
  return Response.json({ ok: true });
}
