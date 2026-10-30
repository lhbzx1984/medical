// 病例（病人 + 初步方案）与手术规划列表。
import { NextRequest } from "next/server";
import { apiError, assertSameOrigin, requireStore } from "@/lib/http";
import { readJson, textField, integerField, enumField } from "@/lib/validation";

export async function GET() {
  try {
    const store = await requireStore();
    return Response.json({ plans: await store.listPlans(), store: store.kind });
  } catch (error) { return apiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const store = await requireStore();
    const body = await readJson(req);
    const input = {
      name: textField(body, "patientName", 200),
      gender: enumField(body.gender ?? "", ["", "男", "女"], "gender"),
      age: integerField(body.age ?? 0, 0, 130, "age"),
      medicalRecord: textField(body, "medicalRecord", 20000),
      preliminaryPlan: textField(body, "preliminaryPlan", 10000, true),
    };
    const title = textField(body, "title", 200, true) || undefined;
    // 病人与规划是两次写入；数据库不授予应用用户删除病人的权限，规划写入失败时无法在此回滚。
    const patient = await store.createPatient(input);
    const plan = await store.createPlan({ patientId: patient.id, title });
    return Response.json({ patient, plan }, { status: 201 });
  } catch (error) { return apiError(error); }
}
