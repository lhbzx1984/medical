// 手术规划详情（含版本历史、专家反馈、模拟记录）。
import { apiError, ApiError, assertSameOrigin, requireStore } from "@/lib/http";
import { readJson, textField, integerField, ValidationError } from "@/lib/validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = await requireStore();
    const detail = await store.getPlanDetail(id);
    if (!detail) throw new ApiError("未找到该手术规划", 404);
    return Response.json(detail);
  } catch (error) { return apiError(error); }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const store = await requireStore();
    const body = await readJson(req);
    const expectedUpdatedAt = textField(body, "expectedUpdatedAt", 64);
    if (!Number.isFinite(Date.parse(expectedUpdatedAt))) throw new ValidationError("expectedUpdatedAt 必须是有效时间");
    const patient = {
      name: textField(body, "patientName", 200),
      gender: textField(body, "gender", 50, true),
      age: integerField(body.age, 0, 130, "age"),
      medicalRecord: textField(body, "medicalRecord", 20000),
      preliminaryPlan: textField(body, "preliminaryPlan", 10000, true),
    };
    const { id } = await params;
    await store.updateCase(id, expectedUpdatedAt, patient);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
