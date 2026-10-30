// 病例（病人 + 初步方案）与手术规划列表。
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";


export async function GET() {
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const plans = await store.listPlans();
  return Response.json({ plans, store: store.kind });
}

export async function POST(req: NextRequest) {
  let body: {
    patientName?: string;
    gender?: string;
    age?: number;
    medicalRecord?: string;
    preliminaryPlan?: string;
    title?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof body.patientName !== "string" || !body.patientName.trim()) {
    return Response.json({ error: "患者姓名不能为空" }, { status: 400 });
  }
  if ((body.gender !== undefined && typeof body.gender !== "string") ||
      (body.age !== undefined && (!Number.isInteger(body.age) || body.age < 0 || body.age > 150)) ||
      (body.medicalRecord !== undefined && typeof body.medicalRecord !== "string") ||
      (body.preliminaryPlan !== undefined && typeof body.preliminaryPlan !== "string") ||
      (body.title !== undefined && typeof body.title !== "string")) {
    return Response.json({ error: "病例字段格式不正确" }, { status: 400 });
  }
  if (body.patientName.length > 200 || (body.gender?.length ?? 0) > 50 ||
      (body.medicalRecord?.length ?? 0) > 50000 || (body.preliminaryPlan?.length ?? 0) > 50000 ||
      (body.title?.length ?? 0) > 500) {
    return Response.json({ error: "病例字段过长" }, { status: 400 });
  }
  const store = await getStore();
  if (!store) return Response.json({ error: "请先登录" }, { status: 401 });
  const patient = await store.createPatient({
    name: body.patientName.trim(),
    gender: body.gender,
    age: body.age,
    medicalRecord: body.medicalRecord,
    preliminaryPlan: body.preliminaryPlan,
  });
  const plan = await store.createPlan({
    patientId: patient.id,
    title: body.title,
  });
  return Response.json({ patient, plan }, { status: 201 });
}
